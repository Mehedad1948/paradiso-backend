import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// Bump when the shape of anything stored changes; old keys simply expire.
const KEY_PREFIX = 'paradiso:v1:';
// Values above this many characters are gzipped: TMDb credits are large and
// Redis is billed and slowed by bytes.
const COMPRESS_ABOVE = 8 * 1024;
// A Redis that does not answer must cost a request milliseconds, not seconds.
const COMMAND_TIMEOUT_MS = 500;
const ERROR_LOG_INTERVAL_MS = 60_000;

// Shared, optional cache in front of slow or rate-limited lookups.
//
// Redis is only ever an accelerator: with no REDIS_URL, in tests, or while
// Redis is down, every call behaves as a miss and the caller loads the value
// itself. Nothing may live only here.
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger('Cache');
  private readonly redis: Redis | null;
  // Concurrent callers asking for one key share a single load.
  private readonly loading = new Map<string, Promise<unknown>>();
  private lastErrorLog = 0;

  constructor(config: ConfigService) {
    const url = config.get<string>('appConfig.redisUrl');
    // The database suite loads .env.development; it must never reach the
    // real cache.
    const environment = config.get<string>('appConfig.environment');
    if (!url || environment === 'test') {
      this.redis = null;
      this.logger.log(
        url ? 'Redis disabled in tests' : 'REDIS_URL not set: caching is off',
      );
      return;
    }
    this.redis = new Redis(url, {
      connectTimeout: 10_000,
      commandTimeout: COMMAND_TIMEOUT_MS,
      maxRetriesPerRequest: 1,
      // Fail at once while disconnected instead of queueing requests.
      enableOfflineQueue: false,
      retryStrategy: (attempt) => Math.min(attempt * 500, 10_000),
    });
    this.redis.on('error', (error) => this.logFailure('connection', error));
    this.redis.on('ready', () => this.logger.log('Redis connected'));
  }

  get enabled(): boolean {
    return this.redis !== null;
  }

  onModuleDestroy() {
    this.redis?.disconnect();
  }

  // The cached value, or undefined on a miss or any Redis problem.
  async get<T>(key: string): Promise<T | undefined> {
    if (!this.redis) return undefined;
    try {
      const stored = await this.redis.get(KEY_PREFIX + key);
      return stored === null ? undefined : await decode<T>(stored);
    } catch (error) {
      this.logFailure('get', error);
      return undefined;
    }
  }

  // Never throws or rejects; a failed write only means a later miss.
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.redis || value === undefined) return;
    try {
      await this.redis.set(
        KEY_PREFIX + key,
        await encode(value),
        'EX',
        ttlSeconds,
      );
    } catch (error) {
      this.logFailure('set', error);
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(KEY_PREFIX + key);
    } catch (error) {
      this.logFailure('delete', error);
    }
  }

  // Cached value, else load() it and keep the result for ttlSeconds. A load
  // that throws is not cached and its error reaches every waiting caller.
  remember<T>(
    key: string,
    ttlSeconds: number,
    load: () => Promise<T>,
  ): Promise<T> {
    const running = this.loading.get(key) as Promise<T> | undefined;
    if (running) return running;
    const started = Date.now();
    const promise = (async () => {
      const cached = await this.get<T>(key);
      if (cached !== undefined) {
        this.logger.debug(`hit ${key} ${Date.now() - started}ms`);
        return cached;
      }
      const value = await load();
      // Not awaited: the caller should not wait for the write.
      void this.set(key, value, ttlSeconds);
      return value;
    })().finally(() => this.loading.delete(key));
    this.loading.set(key, promise);
    return promise;
  }

  private logFailure(action: string, error: unknown) {
    const now = Date.now();
    if (now - this.lastErrorLog < ERROR_LOG_INTERVAL_MS) return;
    this.lastErrorLog = now;
    const message = error instanceof Error ? error.message : String(error);
    // Message only: a connection error can echo the URL.
    this.logger.warn(
      `Redis ${action} failed, continuing without cache: ${message.replace(/rediss?:\/\/\S+/g, 'redis://***')}`,
    );
  }
}

async function encode(value: unknown): Promise<string> {
  const json = JSON.stringify(value);
  if (json.length <= COMPRESS_ABOVE) return 'j:' + json;
  return 'z:' + (await gzipAsync(json)).toString('base64');
}

// A value that cannot be read back is a miss, not an error.
async function decode<T>(stored: string): Promise<T | undefined> {
  try {
    if (stored.startsWith('j:')) return JSON.parse(stored.slice(2)) as T;
    if (stored.startsWith('z:')) {
      const json = await gunzipAsync(Buffer.from(stored.slice(2), 'base64'));
      return JSON.parse(json.toString('utf8')) as T;
    }
  } catch {
    // fall through
  }
  return undefined;
}
