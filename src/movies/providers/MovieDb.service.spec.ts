import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../../cache/cache.service';
import {
  MovieDbService,
  RATE_LIMIT_RETRIES,
  TMDB_CACHE_TTL,
} from './MovieDb.serviec';

// No Redis: every lookup is a miss and runs the loader.
const noCache = () => new CacheService(new ConfigService({}));

describe('Movie catalogue failure handling', () => {
  const waits: number[] = [];
  // Records backoff instead of sleeping through it.
  class TestMovieDbService extends MovieDbService {
    protected wait(ms: number) {
      waits.push(ms);
      return Promise.resolve();
    }
  }
  const service = new TestMovieDbService(
    new ConfigService({
      appConfig: {
        tmdbApiKey: 'test-only',
        baseUrl: 'https://catalogue.example.test/3',
      },
    }),
    noCache(),
  );
  afterEach(() => {
    jest.restoreAllMocks();
    waits.length = 0;
  });
  it.each([
    [404, NotFoundException],
    [429, ServiceUnavailableException],
    [500, BadGatewayException],
  ])(
    'maps upstream status %s to an HTTP exception',
    async (status, exception) => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('', { status }));
      await expect(service.getMovieDetails(1)).rejects.toBeInstanceOf(
        exception,
      );
    },
  );
  it('retries rate limits, honouring Retry-After, then succeeds', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response('', { status: 429, headers: { 'Retry-After': '2' } }),
      )
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(Response.json({ id: 1, title: 'Found' }));
    await expect(service.getMovieDetails(1)).resolves.toMatchObject({
      title: 'Found',
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    // Retry-After in seconds, then exponential backoff without the header.
    expect(waits).toEqual([2000, 1000]);
  });
  it('gives up on a rate limit after the retries', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(
          new Response('', { status: 429, headers: { 'Retry-After': '600' } }),
        ),
      );
    await expect(service.getMovieDetails(1)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetch).toHaveBeenCalledTimes(RATE_LIMIT_RETRIES + 1);
    // Long Retry-After values are capped so a request never hangs.
    expect(Math.max(...waits)).toBe(5000);
  });
  it('asks for a person, credits and external IDs in one request', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ id: 525, name: 'Someone' }));
    await service.getPerson(525, 'fr-FR');
    expect(fetch).toHaveBeenCalledTimes(1);
    const url = new URL(fetch.mock.calls[0][0] as URL);
    expect(url.pathname).toBe('/3/person/525');
    expect(url.searchParams.get('append_to_response')).toBe(
      'movie_credits,external_ids',
    );
    expect(url.searchParams.get('language')).toBe('fr-FR');
    expect(() => service.getPerson(0)).toThrow(BadRequestException);
  });
  it('bounds requests and reports timeouts', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new DOMException('Timeout', 'TimeoutError'));
    await expect(service.getMovieDetails(1)).rejects.toBeInstanceOf(
      GatewayTimeoutException,
    );
    expect(fetch.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });
  it('maps malformed JSON to a gateway error', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('invalid-json'));
    await expect(service.getMovieDetails(1)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});

describe('Movie catalogue search filtering', () => {
  const service = new MovieDbService(
    new ConfigService({
      appConfig: {
        tmdbApiKey: 'test-only',
        baseUrl: 'https://catalogue.example.test/3',
      },
    }),
    noCache(),
  );
  afterEach(() => jest.restoreAllMocks());
  it('excludes adult and erotic-keyword titles', async () => {
    const keywords: Record<string, { name: string }[]> = {
      '1': [{ name: 'heist' }],
      '3': [{ name: 'erotic movie' }],
    };
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input) => {
        const url = new URL(input as URL);
        const match = /movie\/(\d+)\/keywords$/.exec(url.pathname);
        const body = match
          ? { id: Number(match[1]), keywords: keywords[match[1]] }
          : {
              page: 1,
              total_pages: 1,
              total_results: 4,
              results: [
                { id: 1, title: 'Kept', adult: false },
                { id: 2, title: 'Adult', adult: true },
                // Only its keywords give it away.
                { id: 3, title: 'Innocent title', adult: false },
                // Unflagged, but its text does; no keyword lookup needed.
                {
                  id: 4,
                  title: 'Busty Blondes',
                  overview: 'Topless antics.',
                  adult: false,
                  vote_count: 1,
                },
              ],
            };
        return Promise.resolve(Response.json(body));
      });
    const result = await service.searchMovies('anything');
    expect(result.results.map((movie) => movie.id)).toEqual([1]);
    const searchUrl = new URL(fetch.mock.calls[0][0] as URL);
    expect(searchUrl.searchParams.get('include_adult')).toBe('false');
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});

describe('Movie catalogue caching', () => {
  // Remembers answers by key, like Redis would, and records the expiries.
  const kept = new Map<string, unknown>();
  const ttls: Record<string, number> = {};
  const cache = {
    remember: async (
      key: string,
      ttl: number,
      load: () => Promise<unknown>,
    ) => {
      if (kept.has(key)) return kept.get(key);
      const value = await load();
      kept.set(key, value);
      ttls[key] = ttl;
      return value;
    },
  } as unknown as CacheService;
  const service = new MovieDbService(
    new ConfigService({
      appConfig: {
        tmdbApiKey: 'secret-key',
        baseUrl: 'https://catalogue.example.test/3',
      },
    }),
    cache,
  );
  afterEach(() => {
    jest.restoreAllMocks();
    kept.clear();
  });

  it('asks TMDb once for a repeated movie and keeps it for hours', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(Response.json({ id: 550, title: 'Fight Club' })),
      );
    await service.getMovieDetails(550);
    await expect(service.getMovieDetails(550)).resolves.toMatchObject({
      title: 'Fight Club',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(ttls['tmdb:movie/550?language=en-US']).toBe(TMDB_CACHE_TTL.movie);
  });

  it('keeps languages apart and never puts the API key in a key', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(Response.json({ id: 1 })));
    await service.getPerson(1, 'en-US');
    await service.getPerson(1, 'fr-FR');
    const keys = [...kept.keys()];
    expect(keys).toHaveLength(2);
    expect(keys.join()).not.toContain('secret-key');
    expect(keys.some((key) => key.includes('language=fr-FR'))).toBe(true);
  });

  it('does not cache a failed lookup', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(Response.json({ id: 9, title: 'Back' }));
    await expect(service.getMovieDetails(9)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    await expect(service.getMovieDetails(9)).resolves.toMatchObject({
      title: 'Back',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('caches a whole search, so a repeat makes no TMDb calls', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation((input) =>
      Promise.resolve(
        Response.json(
          /keywords$/.test(new URL(input as URL).pathname)
            ? { keywords: [] }
            : {
                page: 1,
                total_pages: 1,
                total_results: 1,
                results: [{ id: 1, title: 'Kept', adult: false }],
              },
        ),
      ),
    );
    await service.searchMovies('batman');
    const calls = fetch.mock.calls.length;
    await service.searchMovies('batman');
    expect(fetch.mock.calls.length).toBe(calls);
  });
});
