import {
  BadGatewayException,
  GatewayTimeoutException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MovieDbService } from './MovieDb.serviec';

describe('Movie catalogue failure handling', () => {
  const service = new MovieDbService(
    new ConfigService({
      appConfig: {
        tmdbApiKey: 'test-only',
        baseUrl: 'https://catalogue.example.test/3',
      },
    }),
  );
  afterEach(() => jest.restoreAllMocks());
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
