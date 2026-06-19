import {
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { REQUEST_USER_KEY } from 'src/auth/constants/auth.constants';
import { Paginated } from 'src/common/pagination/interfaces/paginated.interface';
import { PaginationProvider } from 'src/common/pagination/providers/pagination.provider';
import { GetRatingDto, MovieSortOption } from 'src/ratings/dtos/get-rating.dto';
import { RatingsService } from 'src/ratings/providers/ratings.service';
import { RoomsService } from 'src/rooms/providers/rooms.service';
import { UserResponseDto } from 'src/users/dtos/user-response.dto';
import { UsersService } from 'src/users/providers/users.service';
import { Repository } from 'typeorm';
import { GetMovieDto } from '../dtos/get-movie.dto';
import { Movie } from '../movie.entity';

@Injectable()
export class GetMovieProvider {
  constructor(
    @InjectRepository(Movie)
    private readonly movieRepository: Repository<Movie>,

    @Inject(REQUEST) private readonly request: Request,

    private readonly userService: UsersService,

    @Inject(forwardRef(() => RoomsService))
    private readonly roomService: RoomsService,

    @Inject(forwardRef(() => RatingsService))
    private readonly ratingsService: RatingsService,

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
          'movie.release_date',
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
        '❌ Failed to get all movies with ratings and users:🐞',
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

    console.log('✅✅✅', ratingQuery, roomId);

    const users = await this.roomService.getRoomUsers(roomId);

    try {
      const moviesQuery = this.movieRepository
        .createQueryBuilder('movie')
        .innerJoin('movie.rooms', 'room')
        .leftJoin('movie.ratings', 'rating', 'rating.room.id = :roomId', {
          roomId,
        })
        .leftJoin('rating.user', 'rater')
        .leftJoin('movie.addedBy', 'user')
        .where('room.id = :roomId', { roomId })
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
        ])
        .addSelect('AVG(rating.rate)', 'averageRate') // Always select avg
        .groupBy('movie.id')
        .addGroupBy('user.id');

      if (ratingQuery.search) {
        moviesQuery.andWhere('LOWER(movie.title) LIKE :search', {
          search: `%${ratingQuery.search.toLowerCase()}%`,
        });
      }

      if (ratingQuery.isWatchTogether !== undefined) {
        moviesQuery.andWhere('movie.isWatchedTogether = :isWatchTogether', {
          isWatchTogether: ratingQuery.isWatchTogether,
        });
      }

      const sortOrder =
        ratingQuery.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
      const averageRateSelect = 'AVG(rating.rate)';
      const userSpecificRateSelect =
        'MAX(CASE WHEN rater.id = :sortByUserId THEN rating.rate ELSE NULL END)';

      if (ratingQuery.sortBy === MovieSortOption.RATE) {
        moviesQuery
          .orderBy('"averageRate"', sortOrder, 'NULLS LAST')
          .addOrderBy('movie.createdAt', 'DESC');
      } else if (
        ratingQuery.sortBy === MovieSortOption.USER_RATE &&
        ratingQuery.sortByUserId
      ) {
        moviesQuery
          .addSelect(userSpecificRateSelect, 'userSpecificRate')
          .orderBy('"userSpecificRate"', sortOrder, 'NULLS LAST')
          .addOrderBy('movie.createdAt', 'DESC')
          .setParameter('sortByUserId', ratingQuery.sortByUserId);
      } else {
        moviesQuery.orderBy('movie.createdAt', 'DESC');
      }

      const limit = ratingQuery.limit ?? 10;
      const page = ratingQuery.page ?? 1;
      const offset = (page - 1) * limit;

      const totalItemsQuery = this.movieRepository
        .createQueryBuilder('movie')
        .innerJoin('movie.rooms', 'room')
        .where('room.id = :roomId', { roomId });

      if (ratingQuery.search) {
        totalItemsQuery.andWhere('LOWER(movie.title) LIKE :search', {
          search: `%${ratingQuery.search.toLowerCase()}%`,
        });
      }

      if (ratingQuery.isWatchTogether !== undefined) {
        totalItemsQuery.andWhere('movie.isWatchedTogether = :isWatchTogether', {
          isWatchTogether: ratingQuery.isWatchTogether,
        });
      }

      const [totalItems, rawMovies] = await Promise.all([
        totalItemsQuery.getCount(),
        moviesQuery.limit(limit).offset(offset).getRawMany(),
      ]);

      const totalPages = Math.ceil(totalItems / limit);
      const movieRows = rawMovies.map((rawMovie) => ({
        id: rawMovie.movie_id,
        title: rawMovie.movie_title,
        poster_path: rawMovie.movie_poster_path,
        release_date: rawMovie.movie_release_date,
        isWatchedTogether: rawMovie.movie_isWatchedTogether,
        createdAt: rawMovie.movie_createdAt,
        addedBy: rawMovie.user_id
          ? {
              id: rawMovie.user_id,
              username: rawMovie.user_username,
              avatar: rawMovie.user_avatar,
            }
          : null,
        averageRate:
          rawMovie.averageRate !== null && rawMovie.averageRate !== undefined
            ? parseFloat(rawMovie.averageRate)
            : null,
        userSpecificRate:
          rawMovie.userSpecificRate !== null &&
          rawMovie.userSpecificRate !== undefined
            ? parseFloat(rawMovie.userSpecificRate)
            : null,
      }));

      const baseURL = this.request.protocol + '://' + this.request.get('host');
      const newUrl = new URL(this.request.url, baseURL);
      const nextPage = page + 1 <= totalPages ? page + 1 : page;
      const previousPage = page - 1 > 0 ? page - 1 : page;

      const movies = {
        data: movieRows,
        meta: {
          totalItems,
          itemsPerPage: limit,
          totalPages,
          currentPage: page,
        },
        links: {
          first: `${newUrl.origin}${newUrl.pathname}?limit=${limit}&page=1`,
          current: `${newUrl.origin}${newUrl.pathname}?limit=${limit}&page=${page}`,
          next: `${newUrl.origin}${newUrl.pathname}?limit=${limit}&page=${nextPage}`,
          previous: `${newUrl.origin}${newUrl.pathname}?limit=${limit}&page=${previousPage}`,
          last: `${newUrl.origin}${newUrl.pathname}?limit=${limit}&page=${totalPages}`,
        },
      };

      const movieIds = movies.data.map((m: any) => m.id);

      const ratings = await this.ratingsService.getRatingsOfRoomWithMovies(
        roomId,
        movieIds,
      );

      const fullMovies = movies.data.map((movie: any) => {
        const existingRatings = ratings.filter((r) => r.movie.id === movie.id);

        const allRatings = users.map((user) => {
          const matchedRating = existingRatings.find(
            (r) => r.user?.id === user.id,
          );
          return {
            user,
            rate: matchedRating?.rate ?? null,
          };
        });

        return {
          ...movie,
          ratings: allRatings,
          hasVoted: existingRatings.some((r) => r.user?.id === userId),
        };
      });

      return {
        ...movies,
        data: fullMovies,
      };
    } catch (error) {
      console.error('❌ Failed to get all movies with ratings 🐞', error);
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
