import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Movie } from '../movies/movie.entity';
import { PaginationProvider } from '../common/pagination/providers/pagination.provider';
import { PaginationQueryDto } from '../common/pagination/dtos/pagination-query.dto';
import { WatchlistItem } from './watchlist-item.entity';

@Injectable()
export class WatchlistService {
  constructor(
    @InjectRepository(WatchlistItem)
    private readonly items: Repository<WatchlistItem>,
    @InjectRepository(Movie) private readonly movies: Repository<Movie>,
    private readonly pagination: PaginationProvider,
  ) {}

  async list(userId: number, query: PaginationQueryDto) {
    const page = await this.pagination.paginateQuery(
      query,
      this.items
        .createQueryBuilder('item')
        .innerJoinAndSelect('item.movie', 'movie')
        .leftJoinAndSelect('movie.genres', 'genre')
        .where('item.userId = :userId', { userId })
        .orderBy('item.createdAt', 'DESC')
        .addOrderBy('item.movieId', 'ASC'),
    );
    return {
      ...page,
      data: page.data.map(({ createdAt, movie }) => ({
        addedAt: createdAt,
        movie,
      })),
    };
  }

  async has(userId: number, movieId: string) {
    return { inWatchlist: await this.items.existsBy({ userId, movieId }) };
  }

  // Idempotent: adding a movie that is already saved is a no-op.
  async add(userId: number, movieId: string) {
    if (!(await this.movies.existsBy({ id: movieId }))) {
      throw new NotFoundException('Movie not found');
    }
    await this.items
      .createQueryBuilder()
      .insert()
      .values({ userId, movieId })
      .orIgnore()
      .execute();
    return { message: 'Movie added to watchlist' };
  }

  async remove(userId: number, movieId: string) {
    await this.items.delete({ userId, movieId });
    return { message: 'Movie removed from watchlist' };
  }
}
