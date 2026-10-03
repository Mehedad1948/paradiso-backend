import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface TmdbGenre {
  id: number;
  name: string;
}
export interface TmdbMovie {
  id: number;
  title: string;
  overview: string;
  release_date: string;
  poster_path: string;
  backdrop_path: string;
  adult: boolean;
  popularity: number;
  vote_average: number;
  vote_count: number;
  genres: TmdbGenre[];
}

@Injectable()
export class MovieDbService {
  constructor(private readonly configService: ConfigService) {}

  private async get<T>(
    endpoint: string,
    params: Record<string, string | number> = {},
  ): Promise<T> {
    const apiKey = this.configService.get<string>('appConfig.tmdbApiKey');
    if (!apiKey)
      throw new ServiceUnavailableException(
        'Movie catalogue is not configured',
      );
    const baseUrl =
      this.configService.get<string>('appConfig.baseUrl') ??
      'https://api.themoviedb.org/3';
    const url = new URL(baseUrl.replace(/\/$/, '') + '/' + endpoint);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('language', 'en-US');
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, String(value));
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')
      ) {
        throw new GatewayTimeoutException('Movie catalogue timed out');
      }
      throw new BadGatewayException('Movie catalogue is unavailable');
    }
    if (res.status === 404)
      throw new NotFoundException('Movie not found in catalogue');
    if (res.status === 429)
      throw new ServiceUnavailableException('Movie catalogue is busy');
    if (!res.ok)
      throw new BadGatewayException('Movie catalogue request failed');
    try {
      return (await res.json()) as T;
    } catch {
      throw new BadGatewayException(
        'Movie catalogue returned an invalid response',
      );
    }
  }

  searchMovies(query: string, page = 1) {
    return this.get<{
      results: TmdbMovie[];
      page: number;
      total_pages: number;
      total_results: number;
    }>('search/movie', { query, page });
  }
  async getGenres(): Promise<TmdbGenre[]> {
    return (await this.get<{ genres: TmdbGenre[] }>('genre/movie/list')).genres;
  }
  getMovieDetails(movieId: number): Promise<TmdbMovie> {
    if (!Number.isSafeInteger(movieId) || movieId < 1)
      throw new BadRequestException('Invalid TMDb movie ID');
    return this.get<TmdbMovie>('movie/' + movieId);
  }
}
