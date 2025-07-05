import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Paginated } from 'src/common/pagination/interfaces/paginated.interface';
import { PaginationProvider } from 'src/common/pagination/providers/pagination.provider';
import { GetRatingDto } from 'src/ratings/dtos/get-rating.dto';
import { UserResponseDto } from 'src/users/dtos/user-response.dto';
import { UsersService } from 'src/users/providers/users.service';
import { Repository } from 'typeorm';
import { GetMovieDto } from '../dtos/get-movie.dto';
import { Movie } from '../movie.entity';
import { REQUEST } from '@nestjs/core';
import { REQUEST_USER_KEY } from 'src/auth/constants/auth.constants';

@Injectable()
export class GetMovieProvider {
  constructor(
    @InjectRepository(Movie)
    private readonly movieRepository: Repository<Movie>,

    @Inject(REQUEST) private readonly request: Request,

    private readonly userService: UsersService,

    private readonly paginationProvider: PaginationProvider,
  ) {}

  async getAll(movieQuery: GetMovieDto): Promise<Paginated<Movie>> {
    try {
      const moviesQuery = this.movieRepository
        .createQueryBuilder('movie')
        .leftJoinAndSelect('movie.addedBy', 'user')
        .leftJoinAndSelect('movie.genres', 'genre')
        .select([
          'movie',
          'user.id',
          'user.username',
          'user.avatar',
          'genre.id',
          'genre.name',
        ]);

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

  async getMovieWithMovieDbId(dbId: number): Promise<Movie | null> {
    try {
      const movie = await this.movieRepository
        .createQueryBuilder('movie')
        .leftJoinAndSelect('movie.addedBy', 'user')
        .select(['movie', 'user.id', 'user.username', 'user.avatar'])
        .where('movie.dbId = :dbId', { dbId })
        .getOne();

      return movie;
    } catch (error) {
      console.error(`❌ Failed to get movie with dbId ${dbId}:`, error);
      throw error instanceof NotFoundException
        ? error
        : new InternalServerErrorException('Failed to get movie');
    }
  }

  async getAllWithRatings(
    ratingQuery: GetRatingDto,
  ): Promise<{ movies: Paginated<Movie>; users: UserResponseDto[] }> {
    try {
      const moviesQuery = this.movieRepository
        .createQueryBuilder('movie')
        .leftJoinAndSelect('movie.addedBy', 'addedBy')
        .leftJoinAndSelect('movie.ratings', 'rating')
        .leftJoinAndSelect('rating.user', 'ratingUser')
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

      const users = await this.userService.getRatingUsers();

      return {
        movies,
        users,
      };
    } catch (error) {
      console.error(
        '❌ Failed to get all movies with ratings and users:',
        error,
      );
      throw new InternalServerErrorException(
        'Failed to get movies with ratings and users',
      );
    }
  }

  async getMoviesRatingORoom(ratingQuery: GetRatingDto, roomId: number) {
    const userPayload = this.request[REQUEST_USER_KEY];
    const userId = userPayload?.sub;
    try {
      const moviesQuery = this.movieRepository
        .createQueryBuilder('movie')
        .innerJoin('movie.rooms', 'room') // joins only movies that belong to this room
        .leftJoin('movie.ratings', 'rating', 'rating.room.id = :roomId', {
          roomId,
        }) // get ratings only for this room
        .leftJoin('rating.user', 'rater')
        .leftJoin('movie.addedBy', 'user')
        .where('room.id = :roomId', { roomId }) // ✅ FIXED: use "room.id", not "movie.room.id"
        .select([
          'movie.id',
          'movie.title',
          'movie.poster_path',
          'movie.release_date',
          'movie.isWatchedTogether',
          'movie.createdAt',
          'user.id',
          'user.username',
          'user.avatar',
          'rating.rate',
          'rater.id',
          'rater.username',
          'rater.avatar',
        ])
        .orderBy('movie.createdAt', 'DESC');

      const movies = await this.paginationProvider.paginateQuery(
        {
          limit: ratingQuery.limit,
          page: ratingQuery.page,
        },
        moviesQuery,
      );

      return {
        ...movies,
        data: movies.data.map((movie) => ({
          ...movie,
          hasVoted: !!movie.ratings.find((rate) => rate.id === userId),
        })),
      };
    } catch (error) {
      console.error('❌ Failed to get all movies with ratings ', error);
      throw new InternalServerErrorException(
        'Failed to get movies with ratings ❌',
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
