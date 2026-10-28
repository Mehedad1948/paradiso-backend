import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Movie } from '../movie.entity';
import { toMovieExtras } from '../tmdb-extras';
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
  | 'cast'
  | 'trailerKey'
> & { genres: { id: string; name: string; tmdbId: number }[] };

// complete is false while the catalogue could not be reached, so callers
// know not to cache a response that is still missing its stored details.
export interface MovieDetailsResult {
  details: MovieDetails;
  complete: boolean;
}

@Injectable()
export class MovieDetailsProvider {
  private readonly logger = new Logger(MovieDetailsProvider.name);
  // Concurrent first views of one movie share a single catalogue request.
  private readonly filling = new Map<string, Promise<boolean>>();

  constructor(
    @InjectRepository(Movie)
    private readonly movieRepository: Repository<Movie>,
    private readonly movieDbService: MovieDbService,
  ) {}

  async getDetails(id: string): Promise<MovieDetailsResult> {
    let movie = await this.load(id);
    let complete = true;
    if (movie.dbId !== null && !movie.detailsFetchedAt) {
      complete = await this.fill(movie);
      if (complete) movie = await this.load(id);
    }
    return { details: this.toDetails(movie), complete };
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
        'movie.cast',
        'movie.trailerKey',
        'movie.detailsFetchedAt',
        'genre.id',
        'genre.name',
        'genre.tmdbId',
      ])
      .where('movie.id = :id', { id })
      .getOne();
    if (!movie) throw new NotFoundException('Movie not found');
    return movie;
  }

  private fill(movie: Movie): Promise<boolean> {
    let pending = this.filling.get(movie.id);
    if (!pending) {
      pending = this.fetchAndStore(movie).finally(() =>
        this.filling.delete(movie.id),
      );
      this.filling.set(movie.id, pending);
    }
    return pending;
  }

  private async fetchAndStore(movie: Movie): Promise<boolean> {
    try {
      const details = await this.movieDbService.getMovieDetailsWithExtras(
        movie.dbId!,
      );
      await this.movieRepository.update(movie.id, {
        ...toMovieExtras(details),
        // Keep anything a user already wrote; only fill gaps.
        overview: movie.overview || details.overview || undefined,
      });
      return true;
    } catch (error) {
      // A catalogue ID TMDb no longer knows will never resolve; stop retrying.
      if (error instanceof NotFoundException) {
        await this.movieRepository.update(movie.id, {
          detailsFetchedAt: new Date(),
        });
        return true;
      }
      this.logger.warn(
        'Movie details unavailable for ' + movie.id + ': ' + String(error),
      );
      return false;
    }
  }

  private toDetails(movie: Movie): MovieDetails {
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
      backdrop_path: movie.backdrop_path,
      backdrops: movie.backdrops ?? [],
      vote_average: movie.vote_average ?? null,
      imdbRate: movie.imdbRate ?? null,
      imdbLink: movie.imdbLink ?? null,
      genres: movie.genres.map(({ id, name, tmdbId }) => ({
        id,
        name,
        tmdbId,
      })),
      director: movie.director,
      cast: movie.cast ?? [],
      trailerKey: movie.trailerKey,
    };
  }
}
