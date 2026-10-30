import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import {
  Movie,
  MovieCastMember,
  MovieCrewMember,
  MovieKeyCrewMember,
} from '../movie.entity';
import { DETAILS_VERSION, toMovieExtras } from '../tmdb-extras';
import { isArchiveFootage, isBlockedImage } from '../content-filter';
import { MovieDbService } from './MovieDb.serviec';

export type MovieDetails = Pick<
  Movie,
  | 'id'
  | 'dbId'
  | 'title'
  | 'original_title'
  | 'tagline'
  | 'overview'
  | 'release_date'
  | 'runtime'
  | 'poster_path'
  | 'backdrop_path'
  | 'backdrops'
  | 'vote_average'
  | 'imdbRate'
  | 'imdbLink'
  | 'director'
  | 'trailerKey'
> & {
  genres: { id: string; name: string; tmdbId: number }[];
  directors: MovieCrewMember[];
  crew: MovieKeyCrewMember[];
  cast: (Omit<MovieCastMember, 'id'> & { id: number | null })[];
};

// complete is false while the catalogue could not be reached, so callers
// know not to cache a response that is still missing its stored details.
export interface MovieDetailsResult {
  details: MovieDetails;
  complete: boolean;
}

// What one catalogue request did to a stored movie.
type RefreshOutcome = 'refreshed' | 'empty' | 'missing' | 'failed';

interface BackfillMovie {
  id: string;
  dbId: number;
  title: string;
}

export interface BackfillSummary {
  outdated: number;
  refreshed: number;
  // Stored, but TMDb has no backdrops for these yet; retried after a week.
  empty: BackfillMovie[];
  // TMDb no longer knows the ID.
  missing: BackfillMovie[];
  // Catalogue errors; left outdated, so a re-run tries them again.
  failed: BackfillMovie[];
}

// Films TMDb had no backdrops for are asked again at most this often.
export const EMPTY_GALLERY_RETRY_MS = 7 * 24 * 60 * 60 * 1000;
// TMDb allows roughly 40 requests per 10 seconds.
export const BACKFILL_DELAY_MS = 250;

@Injectable()
export class MovieDetailsProvider {
  private readonly logger = new Logger(MovieDetailsProvider.name);
  // Concurrent first views of one movie share a single catalogue request.
  private readonly filling = new Map<string, Promise<RefreshOutcome>>();

  constructor(
    @InjectRepository(Movie)
    private readonly movieRepository: Repository<Movie>,
    private readonly movieDbService: MovieDbService,
  ) {}

  async getDetails(id: string): Promise<MovieDetailsResult> {
    let movie = await this.load(id);
    let complete = true;
    if (isOutdated(movie)) {
      // A failed refresh still serves what is stored, just uncached.
      complete = (await this.fill(movie)) !== 'failed';
      if (complete) movie = await this.load(id);
    }
    return { details: this.toDetails(movie), complete };
  }

  // Refreshes every catalogue movie getDetails would refresh, one request
  // at a time. Refreshed and empty movies leave the outdated set, so running
  // it again only retries failures.
  async refreshOutdated(
    delayMs = BACKFILL_DELAY_MS,
    log: (message: string) => void = () => undefined,
  ): Promise<BackfillSummary> {
    const movies = await this.findOutdated();
    const summary: BackfillSummary = {
      outdated: movies.length,
      refreshed: 0,
      empty: [],
      missing: [],
      failed: [],
    };
    for (const [index, movie] of movies.entries()) {
      if (index && delayMs) await sleep(delayMs);
      const outcome = await this.fill(movie);
      const ref = { id: movie.id, dbId: movie.dbId!, title: movie.title };
      if (outcome === 'refreshed') summary.refreshed++;
      else summary[outcome].push(ref);
      log(
        `[${index + 1}/${movies.length}] ${outcome} ${movie.title} (tmdb ${movie.dbId})`,
      );
    }
    return summary;
  }

  // Catalogue movies isOutdated would refresh, oldest first.
  findOutdated(): Promise<Movie[]> {
    return this.movieRepository
      .createQueryBuilder('movie')
      .select([
        'movie.id',
        'movie.dbId',
        'movie.title',
        'movie.overview',
        'movie.backdrops',
        'movie.detailsFetchedAt',
        'movie.detailsVersion',
      ])
      .where('movie.dbId IS NOT NULL')
      .andWhere(
        new Brackets((outdated) =>
          outdated
            .where('movie.detailsFetchedAt IS NULL')
            .orWhere('movie.detailsVersion < :version', {
              version: DETAILS_VERSION,
            })
            .orWhere(
              'COALESCE(jsonb_array_length(movie.backdrops), 0) = 0 AND movie.detailsFetchedAt <= :retryBefore',
              { retryBefore: new Date(Date.now() - EMPTY_GALLERY_RETRY_MS) },
            ),
        ),
      )
      .orderBy('movie.createdAt', 'ASC')
      .getMany();
  }

  private async load(id: string): Promise<Movie> {
    const movie = await this.movieRepository
      .createQueryBuilder('movie')
      .leftJoin('movie.genres', 'genre')
      .select([
        'movie.id',
        'movie.dbId',
        'movie.title',
        'movie.original_title',
        'movie.tagline',
        'movie.overview',
        'movie.release_date',
        'movie.runtime',
        'movie.poster_path',
        'movie.backdrop_path',
        'movie.backdrops',
        'movie.vote_average',
        'movie.imdbRate',
        'movie.imdbLink',
        'movie.director',
        'movie.directors',
        'movie.crew',
        'movie.cast',
        'movie.trailerKey',
        'movie.detailsFetchedAt',
        'movie.detailsVersion',
        'genre.id',
        'genre.name',
        'genre.tmdbId',
      ])
      .where('movie.id = :id', { id })
      .getOne();
    if (!movie) throw new NotFoundException('Movie not found');
    return movie;
  }

  private fill(movie: Movie): Promise<RefreshOutcome> {
    let pending = this.filling.get(movie.id);
    if (!pending) {
      pending = this.fetchAndStore(movie).finally(() =>
        this.filling.delete(movie.id),
      );
      this.filling.set(movie.id, pending);
    }
    return pending;
  }

  private async fetchAndStore(movie: Movie): Promise<RefreshOutcome> {
    try {
      const details = await this.movieDbService.getMovieDetailsWithExtras(
        movie.dbId!,
      );
      const extras = toMovieExtras(details);
      await this.movieRepository.update(movie.id, {
        ...extras,
        // Keep anything a user already wrote; only fill gaps.
        overview: movie.overview || details.overview || undefined,
      });
      return extras.backdrops?.length ? 'refreshed' : 'empty';
    } catch (error) {
      // A catalogue ID TMDb no longer knows will not resolve soon; only ask
      // again once the empty-gallery retry window has passed.
      if (error instanceof NotFoundException) {
        await this.movieRepository.update(movie.id, {
          detailsFetchedAt: new Date(),
          detailsVersion: DETAILS_VERSION,
        });
        return 'missing';
      }
      this.logger.warn(
        'Movie details unavailable for ' + movie.id + ': ' + String(error),
      );
      return 'failed';
    }
  }

  private toDetails(movie: Movie): MovieDetails {
    // Rows stored before an image was blocked may still hold it.
    const backdrops = (movie.backdrops ?? []).filter(
      (path) => !isBlockedImage(path),
    );
    return {
      id: movie.id,
      dbId: movie.dbId,
      title: movie.title,
      original_title: movie.original_title ?? null,
      tagline: movie.tagline,
      overview: movie.overview ?? null,
      release_date: movie.release_date ?? null,
      runtime: movie.runtime,
      poster_path: movie.poster_path ?? null,
      backdrop_path: isBlockedImage(movie.backdrop_path)
        ? (backdrops[0] ?? null)
        : movie.backdrop_path,
      backdrops,
      vote_average: movie.vote_average ?? null,
      imdbRate: movie.imdbRate ?? null,
      imdbLink: movie.imdbLink ?? null,
      genres: movie.genres.map(({ id, name, tmdbId }) => ({
        id,
        name,
        tmdbId,
      })),
      director: movie.director,
      directors: movie.directors ?? [],
      crew: movie.crew ?? [],
      // Cast stored before DETAILS_VERSION 2 has no person IDs, and cast
      // stored before the archive-footage rule may still list such credits.
      cast: (movie.cast ?? [])
        .filter((member) => !isArchiveFootage(member.character))
        .map((member) => ({
          id: member.id ?? null,
          name: member.name,
          character: member.character,
          profile_path: member.profile_path,
        })),
      trailerKey: movie.trailerKey,
    };
  }
}

// Catalogue movies need TMDb when never filled, filled by older code, or
// when TMDb had no backdrops and the retry window has passed. Emptiness alone
// is not enough: some films really have no images.
export function isOutdated(
  movie: Pick<
    Movie,
    'dbId' | 'backdrops' | 'detailsFetchedAt' | 'detailsVersion'
  >,
  now = Date.now(),
): boolean {
  if (movie.dbId === null) return false;
  if (!movie.detailsFetchedAt || movie.detailsVersion < DETAILS_VERSION)
    return true;
  return (
    !movie.backdrops?.length &&
    now - movie.detailsFetchedAt.getTime() >= EMPTY_GALLERY_RETRY_MS
  );
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
