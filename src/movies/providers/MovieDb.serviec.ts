import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  Logger,
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
  original_title?: string;
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
    cast?: {
      id: number;
      name: string;
      character?: string;
      profile_path?: string | null;
    }[];
    crew?: {
      id: number;
      name: string;
      job?: string;
      profile_path?: string | null;
    }[];
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

interface TmdbPersonCredit {
  id: number;
  title?: string;
  original_title?: string;
  release_date?: string;
  poster_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  adult?: boolean;
  popularity?: number;
}
export interface TmdbPerson {
  id: number;
  name: string;
  biography?: string;
  birthday?: string | null;
  deathday?: string | null;
  place_of_birth?: string | null;
  profile_path?: string | null;
  known_for_department?: string | null;
  adult?: boolean;
  movie_credits?: {
    cast?: (TmdbPersonCredit & { character?: string | null })[];
    crew?: (TmdbPersonCredit & { job?: string; department?: string })[];
  };
  external_ids?: { imdb_id?: string | null };
}

export const DEFAULT_LANGUAGE = 'en-US';
// 429s are retried this many times, waiting Retry-After (capped) or backoff.
export const RATE_LIMIT_RETRIES = 2;
const RETRY_AFTER_CAP_MS = 5000;
const RETRY_BACKOFF_MS = 500;

@Injectable()
export class MovieDbService {
  private readonly logger = new Logger('TMDb');

  constructor(private readonly configService: ConfigService) {}

  // Overridable so tests do not wait out real backoff.
  protected wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

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
    url.searchParams.set('language', DEFAULT_LANGUAGE);
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, String(value));
    let res: Response;
    for (let attempt = 0; ; attempt++) {
      const started = Date.now();
      try {
        res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      } catch (error) {
        const timedOut =
          typeof error === 'object' &&
          error !== null &&
          'name' in error &&
          (error.name === 'TimeoutError' || error.name === 'AbortError');
        // Path only: the query string carries the API key.
        this.logger.warn(
          `GET ${endpoint} ${timedOut ? 'timed out' : 'failed'} after ${Date.now() - started}ms`,
        );
        if (timedOut)
          throw new GatewayTimeoutException('Movie catalogue timed out');
        throw new BadGatewayException('Movie catalogue is unavailable');
      }
      this.logger.log(
        `GET ${endpoint} ${res.status} ${Date.now() - started}ms`,
      );
      if (res.status !== 429 || attempt >= RATE_LIMIT_RETRIES) break;
      await this.wait(retryDelay(res.headers.get('retry-after'), attempt));
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
  // Profile, filmography and IMDb ID in one request.
  getPerson(
    personId: number,
    language = DEFAULT_LANGUAGE,
  ): Promise<TmdbPerson> {
    if (!Number.isSafeInteger(personId) || personId < 1)
      throw new BadRequestException('Invalid TMDb person ID');
    return this.get<TmdbPerson>('person/' + personId, {
      append_to_response: 'movie_credits,external_ids',
      language,
    });
  }
  // Just the profile, for the English biography fallback.
  getPersonProfile(personId: number, language = DEFAULT_LANGUAGE) {
    return this.get<Pick<TmdbPerson, 'id' | 'biography'>>(
      'person/' + personId,
      { language },
    );
  }
}

// Retry-After is seconds or an HTTP date; absent or invalid falls back to
// exponential backoff.
function retryDelay(header: string | null, attempt: number): number {
  const backoff = RETRY_BACKOFF_MS * 2 ** attempt;
  if (!header) return backoff;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(header) - Date.now();
  if (Number.isNaN(ms)) return backoff;
  return Math.min(Math.max(ms, 0), RETRY_AFTER_CAP_MS);
}
