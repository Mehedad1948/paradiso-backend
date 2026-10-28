import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Genre } from '../../genres/genre.entity';
import { Movie } from '../movie.entity';
import { toMovieExtras } from '../tmdb-extras';
import { MovieDbService } from './MovieDb.serviec';

export type ResolvedMovie = Pick<
  Movie,
  'id' | 'dbId' | 'title' | 'poster_path' | 'isWatchedTogether'
>;

@Injectable()
export class ResolveMovieProvider {
  constructor(
    @InjectRepository(Movie)
    private readonly movieRepository: Repository<Movie>,
    private readonly movieDbService: MovieDbService,
  ) {}

  // Our movie for a TMDb ID, imported on first use. Safe under concurrent
  // calls: the insert yields to the unique "dbId" constraint instead of
  // failing, and whichever caller lost reads the row the winner stored.
  async resolve(
    tmdbId: number,
    userId: number,
    isWatchedTogether = false,
  ): Promise<ResolvedMovie> {
    const existing = await this.find(tmdbId);
    if (existing) return existing;
    // The same request stores the details screen's data, so it never has to
    // call the catalogue for this movie again.
    const details = await this.movieDbService.getMovieDetailsWithExtras(tmdbId);
    return this.movieRepository.manager.transaction(async (manager) => {
      const inserted = await manager
        .createQueryBuilder()
        .insert()
        .into(Movie)
        .values({
          dbId: tmdbId,
          title: details.title,
          original_title: details.original_title || undefined,
          overview: details.overview || undefined,
          release_date: details.release_date || undefined,
          poster_path: details.poster_path || undefined,
          vote_average: details.vote_average ?? undefined,
          isWatchedTogether,
          addedBy: { id: userId },
          ...toMovieExtras(details),
        })
        .orIgnore()
        .returning(['id'])
        .execute();
      const id = (inserted.raw as { id: string }[])[0]?.id;
      if (id && details.genres?.length) {
        const genres = await manager.getRepository(Genre).find({
          select: { id: true },
          where: { tmdbId: In(details.genres.map((genre) => genre.id)) },
        });
        await manager
          .createQueryBuilder()
          .relation(Movie, 'genres')
          .of(id)
          .add(genres.map((genre) => genre.id));
      }
      // A new statement sees the concurrent winner once it has committed.
      return (await this.find(tmdbId, manager.getRepository(Movie)))!;
    });
  }

  private find(
    dbId: number,
    repository = this.movieRepository,
  ): Promise<ResolvedMovie | null> {
    return repository.findOne({
      select: {
        id: true,
        dbId: true,
        title: true,
        poster_path: true,
        isWatchedTogether: true,
      },
      where: { dbId },
      // addedBy is eager; resolving never needs it.
      loadEagerRelations: false,
    });
  }
}
