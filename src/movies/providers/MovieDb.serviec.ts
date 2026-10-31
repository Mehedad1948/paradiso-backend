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
import { CacheService } from '../../cache/cache.service';
import { isAdultContent } from '../content-filter';

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
  keywords?: { keywords?: { name: string }[] };
  production_companies?: { name: string }[];
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

export interface TmdbPoster {
  file_path: string;
  width: number;
  height: number;
  iso_639_1: string | null;
  vote_average?: number;
  vote_count?: number;
}

interface TmdbPersonCredit {
  id: number;
  title?: string;
  overview?: string;
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
  popularity?: number;
  movie_credits?: {
    cast?: (TmdbPersonCredit & { character?: string | null })[];
    crew?: (TmdbPersonCredit & { job?: string; department?: string })[];
  };
  external_ids?: { imdb_id?: string | null };
}

// A row of TMDb's person search and popular lists; no biography or credits.
export interface TmdbPersonSummary {
  id: number;
  name: string;
  profile_path?: string | null;
  known_for_department?: string | null;
  adult?: boolean;
  popularity?: number;
}
export interface TmdbPersonPage {
  results: TmdbPersonSummary[];
  page: number;
  total_pages: number;
  total_results: number;
}

export const DEFAULT_LANGUAGE = 'en-US';
// 429s are retried this many times, waiting Retry-After (capped) or backoff.
export const RATE_LIMIT_RETRIES = 2;
const RETRY_AFTER_CAP_MS = 5000;
const RETRY_BACKOFF_MS = 500;

// How long Redis keeps each kind of TMDb answer. Catalogue data changes
// slowly and most titles are opened rarely, so long lifetimes are what turn
// those rare visits into hits. Searches stay shorter so new releases show up;
// the erotic verdict stays at a week because it decides what is hidden. A
// person is also held for a day or more by PeopleService, so this is kept
// modest to bound the combined staleness.
const HOUR = 60 * 60;
const DAY = 24 * HOUR;
export const TMDB_CACHE_TTL = {
  genres: 30 * DAY,
  movie: 7 * DAY,
  posters: 30 * DAY,
  person: 3 * DAY,
  popularPeople: DAY,
  search: 6 * HOUR,
  eroticVerdict: 7 * DAY,
} as const;

@Injectable()
export class MovieDbService {
  private readonly logger = new Logger('TMDb');

  constructor(
    private readonly configService: ConfigService,
    private readonly cache: CacheService,
  ) {}

  // Overridable so tests do not wait out real backoff.
  protected wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Cached for ttlSeconds when given. Only successful answers are kept, so a
  // TMDb outage or a 404 is asked again on the next request.
  private get<T>(
    endpoint: string,
    params: Record<string, string | number> = {},
    ttlSeconds = 0,
  ): Promise<T> {
    if (!ttlSeconds) return this.request<T>(endpoint, params);
    // The API key is not part of the key; the language always is.
    const query = Object.entries({ language: DEFAULT_LANGUAGE, ...params })
      .map(([name, value]) => `${name}=${encodeURIComponent(String(value))}`)
      .sort()
      .join('&');
    return this.cache.remember(`tmdb:${endpoint}?${query}`, ttlSeconds, () =>
      this.request<T>(endpoint, params),
    );
  }

  private async request<T>(
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

  // The filtered page is what gets cached: a hit skips the search and the
  // per-result keyword lookups below in one step.
  searchMovies(query: string, page = 1) {
    return this.cache.remember(
      `tmdb:search-movies:${page}:${encodeURIComponent(query)}`,
      TMDB_CACHE_TTL.search,
      () => this.searchMoviesUncached(query, page),
    );
  }
  private async searchMoviesUncached(query: string, page: number) {
    const response = await this.get<{
      results: TmdbMovie[];
      page: number;
      total_pages: number;
      total_results: number;
    }>('search/movie', { query, page, include_adult: 'false' });
    const candidates = response.results.filter(
      (movie) => !isAdultContent(movie),
    );
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
    const verdict = await this.cache.remember(
      `tmdb:erotic:${movieId}`,
      TMDB_CACHE_TTL.eroticVerdict,
      async () => {
        const { keywords = [] } = await this.get<{
          keywords?: { id: number; name: string }[];
        }>('movie/' + movieId + '/keywords');
        return keywords.some(({ name }) => /erotic/i.test(name));
      },
    );
    if (this.eroticVerdicts.size >= 10_000) this.eroticVerdicts.clear();
    this.eroticVerdicts.set(movieId, verdict);
    return verdict;
  }
  async getGenres(): Promise<TmdbGenre[]> {
    return (
      await this.get<{ genres: TmdbGenre[] }>(
        'genre/movie/list',
        {},
        TMDB_CACHE_TTL.genres,
      )
    ).genres;
  }
  getMovieDetails(movieId: number): Promise<TmdbMovie> {
    if (!Number.isSafeInteger(movieId) || movieId < 1)
      throw new BadRequestException('Invalid TMDb movie ID');
    return this.get<TmdbMovie>('movie/' + movieId, {}, TMDB_CACHE_TTL.movie);
  }
  // One request for everything the details screen stores; never sent to
  // clients as-is because full credits run to hundreds of kilobytes.
  getMovieDetailsWithExtras(movieId: number): Promise<TmdbMovieWithExtras> {
    if (!Number.isSafeInteger(movieId) || movieId < 1)
      throw new BadRequestException('Invalid TMDb movie ID');
    return this.get<TmdbMovieWithExtras>('movie/' + movieId, {
      // keywords and production_companies feed isAdultContent on import.
      append_to_response: 'credits,videos,images,keywords',
      // language=en-US alone hides trailers tagged in a film's own language
      // and every textless (untagged) image.
      include_video_language: 'en,null',
      include_image_language: 'null,en',
    });
  }
  // Every poster TMDb holds for a film: the ones in English or with no text.
  async getMoviePosters(movieId: number): Promise<TmdbPoster[]> {
    if (!Number.isSafeInteger(movieId) || movieId < 1)
      throw new BadRequestException('Invalid TMDb movie ID');
    const { posters = [] } = await this.get<{ posters?: TmdbPoster[] }>(
      'movie/' + movieId + '/images',
      { include_image_language: 'en,null' },
      TMDB_CACHE_TTL.posters,
    );
    return posters;
  }
  // Profile, filmography and IMDb ID in one request.
  getPerson(
    personId: number,
    language = DEFAULT_LANGUAGE,
  ): Promise<TmdbPerson> {
    if (!Number.isSafeInteger(personId) || personId < 1)
      throw new BadRequestException('Invalid TMDb person ID');
    return this.get<TmdbPerson>(
      'person/' + personId,
      { append_to_response: 'movie_credits,external_ids', language },
      TMDB_CACHE_TTL.person,
    );
  }
  searchPeople(query: string, page = 1): Promise<TmdbPersonPage> {
    return this.get<TmdbPersonPage>(
      'search/person',
      { query, page, include_adult: 'false' },
      TMDB_CACHE_TTL.search,
    );
  }
  // TMDb's popular people, 20 per page.
  getPopularPeople(page = 1): Promise<TmdbPersonPage> {
    return this.get<TmdbPersonPage>(
      'person/popular',
      { page },
      TMDB_CACHE_TTL.popularPeople,
    );
  }
  // Just the profile, for the English biography fallback.
  getPersonProfile(personId: number, language = DEFAULT_LANGUAGE) {
    return this.get<Pick<TmdbPerson, 'id' | 'biography'>>(
      'person/' + personId,
      { language },
      TMDB_CACHE_TTL.person,
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
