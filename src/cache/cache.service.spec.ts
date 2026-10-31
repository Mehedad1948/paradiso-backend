import { ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';

// An in-memory stand-in for ioredis, so no real Redis is touched.
const store = new Map<string, string>();
const fake = {
  failing: false,
  ttls: new Map<string, number>(),
  counters: new Map<string, { count: number; ttl: number }>(),
};
jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    disconnect: jest.fn(),
    get: (key: string) =>
      fake.failing
        ? Promise.reject(new Error('connect to rediss://user:secret@host:6379'))
        : Promise.resolve(store.get(key) ?? null),
    set: (key: string, value: string, _ex: string, ttl: number) => {
      if (fake.failing) return Promise.reject(new Error('down'));
      store.set(key, value);
      fake.ttls.set(key, ttl);
      return Promise.resolve('OK');
    },
    del: (key: string) => Promise.resolve(Number(store.delete(key))),
    // Just enough of a transaction for the counter: set NX EX, incr, ttl.
    multi: () => {
      const steps: (() => unknown)[] = [];
      const chain = {
        set: (key: string, _value: number, _ex: string, ttl: number) => {
          steps.push(() => {
            if (!fake.counters.has(key))
              fake.counters.set(key, { count: 0, ttl });
            return 'OK';
          });
          return chain;
        },
        incr: (key: string) => {
          steps.push(() => ++fake.counters.get(key)!.count);
          return chain;
        },
        ttl: (key: string) => {
          steps.push(() => fake.counters.get(key)!.ttl);
          return chain;
        },
        exec: () =>
          fake.failing
            ? Promise.reject(new Error('down'))
            : Promise.resolve(steps.map((step) => [null, step()])),
      };
      return chain;
    },
  })),
}));

const configWith = (appConfig: Record<string, string | undefined>) =>
  new ConfigService({ appConfig });
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('CacheService', () => {
  beforeEach(() => {
    store.clear();
    fake.ttls.clear();
    fake.counters.clear();
    fake.failing = false;
  });

  describe('with Redis', () => {
    const cache = new CacheService(
      configWith({ redisUrl: 'rediss://default:pw@example.test:6379' }),
    );

    it('loads once, then serves from Redis with the given expiry', async () => {
      const load = jest.fn().mockResolvedValue({ id: 1 });
      await expect(cache.remember('k', 60, load)).resolves.toEqual({ id: 1 });
      await flush();
      await expect(cache.remember('k', 60, load)).resolves.toEqual({ id: 1 });
      expect(load).toHaveBeenCalledTimes(1);
      expect(fake.ttls.get('paradiso:v1:k')).toBe(60);
    });

    it('round-trips large values through compression', async () => {
      const big = { rows: Array.from({ length: 2000 }, (_, i) => ({ i })) };
      await cache.set('big', big, 60);
      const stored = store.get('paradiso:v1:big') ?? '';
      expect(stored.startsWith('z:')).toBe(true);
      expect(stored.length).toBeLessThan(JSON.stringify(big).length);
      await expect(cache.get('big')).resolves.toEqual(big);
    });

    it('keeps false and 0 as real values', async () => {
      await cache.set('flag', false, 60);
      await expect(cache.get('flag')).resolves.toBe(false);
    });

    it('treats an unreadable stored value as a miss', async () => {
      store.set('paradiso:v1:bad', 'z:not-gzip');
      await expect(cache.get('bad')).resolves.toBeUndefined();
      store.set('paradiso:v1:other', 'garbage');
      await expect(cache.get('other')).resolves.toBeUndefined();
    });

    it('falls back to the loader when Redis fails, without leaking the URL', async () => {
      fake.failing = true;
      const warn = jest
        .spyOn(
          (cache as unknown as { logger: { warn: (message: string) => void } })
            .logger,
          'warn',
        )
        .mockImplementation();
      await expect(
        cache.remember('x', 60, () => Promise.resolve(7)),
      ).resolves.toBe(7);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).not.toContain('secret');
    });

    it('does not cache a failed load and shares one load between callers', async () => {
      const load = jest
        .fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValue('ok');
      await expect(cache.remember('e', 60, load)).rejects.toThrow('boom');
      const [a, b] = await Promise.all([
        cache.remember('e', 60, load),
        cache.remember('e', 60, load),
      ]);
      expect([a, b]).toEqual(['ok', 'ok']);
      expect(load).toHaveBeenCalledTimes(2);
    });
  });

  describe('counting events', () => {
    const url = 'rediss://default:pw@example.test:6379';

    it('counts in Redis with the window as expiry', async () => {
      const cache = new CacheService(configWith({ redisUrl: url }));
      const first = await cache.increment('rl:a', 900);
      const second = await cache.increment('rl:a', 900);
      expect([first.count, second.count]).toEqual([1, 2]);
      expect(second.resetInSeconds).toBe(900);
      expect((await cache.increment('rl:b', 900)).count).toBe(1);
    });

    it('counts in memory without Redis and starts over after the window', async () => {
      const cache = new CacheService(configWith({}));
      const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
      expect((await cache.increment('k', 60)).count).toBe(1);
      expect((await cache.increment('k', 60)).count).toBe(2);
      now.mockReturnValue(1_000_000 + 61_000);
      expect((await cache.increment('k', 60)).count).toBe(1);
      now.mockRestore();
    });

    it('keeps counting in memory while Redis fails', async () => {
      const cache = new CacheService(configWith({ redisUrl: url }));
      jest
        .spyOn(
          (cache as unknown as { logger: { warn: (m: string) => void } })
            .logger,
          'warn',
        )
        .mockImplementation();
      fake.failing = true;
      expect((await cache.increment('x', 60)).count).toBe(1);
      expect((await cache.increment('x', 60)).count).toBe(2);
    });
  });

  describe('without Redis', () => {
    it.each([
      ['no URL', { redisUrl: undefined }],
      ['test environment', { redisUrl: 'rediss://x@y:1', environment: 'test' }],
    ])('is a pass-through with %s', async (_name, appConfig) => {
      const cache = new CacheService(configWith(appConfig));
      expect(cache.enabled).toBe(false);
      const load = jest.fn().mockResolvedValue(1);
      await cache.remember('k', 60, load);
      await cache.remember('k', 60, load);
      expect(load).toHaveBeenCalledTimes(2);
      expect(store.size).toBe(0);
    });
  });
});
