import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';
import { Movie } from '../movies/movie.entity';
import { User } from '../users/user.entity';
import { FavoriteMovie } from './favorite-movie.entity';
import { MAX_FAVORITES } from './favorites.dto';

@Injectable()
export class FavoritesService {
  constructor(
    @InjectRepository(FavoriteMovie)
    private readonly favorites: Repository<FavoriteMovie>,
    @InjectRepository(Movie) private readonly movies: Repository<Movie>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async list(userId: number) {
    const rows = await this.favorites
      .createQueryBuilder('favorite')
      .innerJoinAndSelect('favorite.movie', 'movie')
      .leftJoinAndSelect('movie.genres', 'genre')
      .leftJoin('movie.addedBy', 'addedBy')
      .addSelect(['addedBy.id', 'addedBy.username', 'addedBy.avatar'])
      .where('favorite.userId = :userId', { userId })
      .orderBy('favorite.position', 'ASC')
      .getMany();
    // Stored positions can have gaps after removals; expose a clean 1..n rank.
    return {
      data: rows.map(({ createdAt, note, movie }, index) => ({
        position: index + 1,
        addedAt: createdAt,
        note,
        movie: { ...movie, addedBy: movie.addedBy ?? null },
      })),
    };
  }

  async listForProfile(userId: number) {
    if (!(await this.users.existsBy({ id: userId }))) {
      throw new NotFoundException('User not found');
    }
    return this.list(userId);
  }

  async has(userId: number, movieId: string) {
    return { isFavorite: await this.favorites.existsBy({ userId, movieId }) };
  }

  // Idempotent: a movie that is already a favorite keeps its place.
  async add(userId: number, movieId: string) {
    await this.requireMovies([movieId]);
    await this.dataSource.transaction(async (manager) => {
      await this.lockUser(manager, userId);
      const repo = manager.getRepository(FavoriteMovie);
      if (await repo.existsBy({ userId, movieId })) return;
      const stats = await repo
        .createQueryBuilder('favorite')
        .select('count(*)::int', 'count')
        .addSelect('max(favorite.position)', 'last')
        .where('favorite.userId = :userId', { userId })
        .getRawOne<{ count: number; last: number | null }>();
      if ((stats?.count ?? 0) >= MAX_FAVORITES) {
        throw new BadRequestException(
          `You can have at most ${MAX_FAVORITES} favorite movies`,
        );
      }
      await repo.insert({
        userId,
        movieId,
        position: (stats?.last ?? -1) + 1,
      });
    });
    return { message: 'Movie added to favorites' };
  }

  // Replaces the whole list, which is also how favorites are reordered.
  async set(userId: number, movieIds: string[]) {
    await this.requireMovies(movieIds);
    await this.dataSource.transaction(async (manager) => {
      await this.lockUser(manager, userId);
      const repo = manager.getRepository(FavoriteMovie);
      await repo.delete(
        movieIds.length ? { userId, movieId: Not(In(movieIds)) } : { userId },
      );
      if (!movieIds.length) return;
      // Movies already in the list keep their addedAt and note; only position changes.
      await repo
        .createQueryBuilder()
        .insert()
        .values(
          movieIds.map((movieId, position) => ({ userId, movieId, position })),
        )
        .orUpdate(['position'], ['userId', 'movieId'])
        .execute();
    });
    return this.list(userId);
  }

  async setNote(userId: number, movieId: string, note: string | null) {
    const { affected } = await this.favorites.update(
      { userId, movieId },
      { note },
    );
    if (!affected) throw new NotFoundException('Movie is not a favorite');
    return this.list(userId);
  }

  async remove(userId: number, movieId: string) {
    await this.favorites.delete({ userId, movieId });
    return { message: 'Movie removed from favorites' };
  }

  private async requireMovies(movieIds: string[]) {
    if (!movieIds.length) return;
    const found = await this.movies.countBy({ id: In(movieIds) });
    if (found !== movieIds.length) {
      throw new NotFoundException('Movie not found');
    }
  }

  // Serializes one user's concurrent edits so the cap and positions hold.
  private async lockUser(manager: EntityManager, userId: number) {
    await manager
      .getRepository(User)
      .createQueryBuilder('user')
      .select('user.id')
      .where('user.id = :userId', { userId })
      .setLock('pessimistic_write')
      .getOne();
  }
}
