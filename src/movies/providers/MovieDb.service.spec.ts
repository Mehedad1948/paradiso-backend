import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MovieDbService, RATE_LIMIT_RETRIES } from './MovieDb.serviec';

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
              total_results: 3,
              results: [
                { id: 1, title: 'Kept', adult: false },
                { id: 2, title: 'Adult', adult: true },
                { id: 3, title: 'Erotic', adult: false },
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
