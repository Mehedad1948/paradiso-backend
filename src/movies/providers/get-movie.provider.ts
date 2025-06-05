import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Movie } from '../movie.entity';
import { Paginated } from 'src/common/pagination/interfaces/paginated.interface';
import { PaginationProvider } from 'src/common/pagination/providers/pagination.provider';
import { GetMovieDto } from '../dtos/get-movie.dto';
import { GetRatingDto } from 'src/ratings/dtos/get-rating.dto';

@Injectable()
export class GetMovieProvider {
  constructor(
    @InjectRepository(Movie)
    private readonly movieRepository: Repository<Movie>,

    private readonly paginationProvider: PaginationProvider,
  ) {}

  async getAll(movieQuery: GetMovieDto): Promise<Paginated<Movie>> {
    try {
      const moviesQuery = this.movieRepository
        .createQueryBuilder('movie')
        .leftJoinAndSelect('movie.addedBy', 'user')
        .select(['movie', 'user.id', 'user.username', 'user.avatar']);

      const movies = await this.paginationProvider.paginateQuery(
        {
          limit: movieQuery.limit,
          page: movieQuery.page,
        },
        moviesQuery,
      );
      console.log('➡️➡️➡️➡️', movies);
      return movies;
    } catch (error) {
      console.error('❌ Failed to get all movies:', error);
      throw new InternalServerErrorException('Failed to get movies');
    }
  }

  async getOne(id: string): Promise<Movie> {
    try {
      const movie = await this.movieRepository
        .createQueryBuilder('movie')
        .leftJoinAndSelect('movie.addedBy', 'user')
        .select(['movie', 'user.id', 'user.username', 'user.avatar'])
        .where('movie.id = :id', { id })
        .getOne();

      if (!movie) {
        throw new NotFoundException(`Movie with id ${id} not found`);
      }

      return movie;
    } catch (error) {
      console.error(`❌ Failed to get movie with id ${id}:`, error);
      throw error instanceof NotFoundException
        ? error
        : new InternalServerErrorException('Failed to get movie');
    }
  }

  async getAllWithRatings(
    ratingQuery: GetRatingDto,
  ): Promise<Paginated<Movie>> {
    try {
      const moviesQuery = this.movieRepository
        .createQueryBuilder('movie')
        .leftJoinAndSelect('movie.addedBy', 'addedBy') // who added the movie
        .leftJoinAndSelect('movie.ratings', 'rating')
        .leftJoinAndSelect('rating.user', 'ratingUser') // who rated the movie
        .select([
          'movie.id',
          'movie.title',
          'movie.releaseDate',
          'movie.imdbRate',
          'movie.image',
          'movie.isWatchedTogether',
          'movie.isIn',
          'movie.createdAt',
          'movie.updatedAt',
          'addedBy.id',
          'rating.rate',
          'ratingUser.id',
          'ratingUser.username',
          'ratingUser.avatar',
        ]);

      const movies = await this.paginationProvider.paginateQuery(
        {
          limit: ratingQuery.limit,
          page: ratingQuery.page,
        },
        moviesQuery,
      );

      return movies;
    } catch (error) {
      console.error('❌ Failed to get all movies with ratings:', error);
      throw new InternalServerErrorException(
        'Failed to get movies with ratings',
      );
    }
  }

  async getOneWithRating(id: string): Promise<Movie> {
    try {
      const movie = await this.movieRepository
        .createQueryBuilder('movie')
        .leftJoinAndSelect('movie.addedBy', 'addedByUser')
        .leftJoinAndSelect('movie.ratings', 'rating')
        .leftJoinAndSelect('rating.user', 'ratingUser')
        .select([
          'movie',
          'addedByUser.id',
          'addedByUser.username',
          'addedByUser.avatar',
          'rating.id',
          'rating.rate',
          'ratingUser.id',
          'ratingUser.username',
          'ratingUser.avatar',
        ])
        .where('movie.id = :id', { id })
        .getOne();

      if (!movie) {
        throw new NotFoundException(`Movie with id ${id} not found`);
      }

      return movie;
    } catch (error) {
      console.error(`❌ Failed to get movie with id ${id}:`, error);
      throw error instanceof NotFoundException
        ? error
        : new InternalServerErrorException('Failed to get movie');
    }
  }
}
