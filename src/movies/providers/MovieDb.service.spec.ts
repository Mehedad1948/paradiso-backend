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
