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
  runtime?: number | null;
  tagline?: string | null;
}
export interface TmdbMovieWithExtras extends TmdbMovie {
  credits?: {
    cast?: { name: string; character?: string; profile_path?: string }[];
    crew?: { name: string; job?: string }[];
  };
  videos?: {
    results?: {
      key: string;
      site?: string;
      type?: string;
      official?: boolean;
      iso_639_1?: string | null;
    }[];
  };
  images?: {
    backdrops?: {
      file_path: string;
      iso_639_1?: string | null;
      vote_average?: number;
      vote_count?: number;
    }[];
  };
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

  // Erotic titles are hidden from search. TMDb has no erotic genre: such
  // films carry the adult flag or an "erotic ..." keyword, and search
  // results omit keywords, so each hit is checked (and cached) separately.
  private readonly eroticVerdicts = new Map<number, boolean>();

  async searchMovies(query: string, page = 1) {
    const response = await this.get<{
      results: TmdbMovie[];
      page: number;
      total_pages: number;
      total_results: number;
    }>('search/movie', { query, page, include_adult: 'false' });
    const candidates = response.results.filter((movie) => !movie.adult);
    const erotic = await Promise.all(
      candidates.map((movie) => this.isErotic(movie.id)),
    );
    return {
      ...response,
      results: candidates.filter((_, index) => !erotic[index]),
    };
  }
  private async isErotic(movieId: number): Promise<boolean> {
    const cached = this.eroticVerdicts.get(movieId);
    if (cached !== undefined) return cached;
    // Fails closed: a lookup error propagates rather than leaking the title.
    const { keywords = [] } = await this.get<{
      keywords?: { id: number; name: string }[];
    }>('movie/' + movieId + '/keywords');
    const verdict = keywords.some(({ name }) => /erotic/i.test(name));
    if (this.eroticVerdicts.size >= 10_000) this.eroticVerdicts.clear();
    this.eroticVerdicts.set(movieId, verdict);
    return verdict;
  }
  async getGenres(): Promise<TmdbGenre[]> {
    return (await this.get<{ genres: TmdbGenre[] }>('genre/movie/list')).genres;
  }
  getMovieDetails(movieId: number): Promise<TmdbMovie> {
    if (!Number.isSafeInteger(movieId) || movieId < 1)
      throw new BadRequestException('Invalid TMDb movie ID');
    return this.get<TmdbMovie>('movie/' + movieId);
  }
  // One request for everything the details screen stores; never sent to
  // clients as-is because full credits run to hundreds of kilobytes.
  getMovieDetailsWithExtras(movieId: number): Promise<TmdbMovieWithExtras> {
    if (!Number.isSafeInteger(movieId) || movieId < 1)
      throw new BadRequestException('Invalid TMDb movie ID');
    return this.get<TmdbMovieWithExtras>('movie/' + movieId, {
      append_to_response: 'credits,videos,images',
      // language=en-US alone hides trailers tagged in a film's own language
      // and every textless (untagged) image.
      include_video_language: 'en,null',
      include_image_language: 'null,en',
    });
  }
}
