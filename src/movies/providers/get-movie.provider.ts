import { AuthenticatedRequest } from '../../auth/interfaces/authenticated-request.interface';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { REQUEST_USER_KEY } from '../../auth/constants/auth.constants';
import { PaginationProvider } from '../../common/pagination/providers/pagination.provider';
import { paginationLinks } from '../../common/pagination/pagination-links';
import {
  GetRatingDto,
  MovieSortOption,
  SortOrder,
} from '../../ratings/dtos/get-rating.dto';
import { RatingsService } from '../../ratings/providers/ratings.service';
import { RoomsService } from '../../rooms/providers/rooms.service';
import { Room } from '../../rooms/room.entity';
import { Rating } from '../../ratings/rating.entity';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { GetMovieDto } from '../dtos/get-movie.dto';
import { Movie } from '../movie.entity';

interface RoomMovieRow {
  id: string;
  title: string;
  poster_path: string;
  release_date: string;
  isWatchedTogether: boolean;
  createdAt: Date;
  addedById: number | null;
  addedByUsername: string | null;
  addedByAvatar: string | null;
  averageRate: string | null;
  userSpecificRate?: string | null;
}

@Injectable()
export class GetMovieProvider {
  constructor(
    @InjectRepository(Movie)
    private readonly movieRepository: Repository<Movie>,
    @Inject(REQUEST) private readonly request: AuthenticatedRequest,
    @Inject(forwardRef(() => RoomsService))
    private readonly roomService: RoomsService,
    @Inject(forwardRef(() => RatingsService))
    private readonly ratingsService: RatingsService,
    private readonly paginationProvider: PaginationProvider,
  ) {}

  private catalogueQuery() {
    return this.movieRepository
      .createQueryBuilder('movie')
      .leftJoin('movie.addedBy', 'addedBy')
      .leftJoin('movie.genres', 'genre')
      .select([
        'movie',
        'addedBy.id',
        'addedBy.username',
        'addedBy.avatar',
        'genre.id',
        'genre.tmdbId',
        'genre.name',
      ]);
  }

  private dates(query: SelectQueryBuilder<Movie>, filters: GetMovieDto) {
    if (
      filters.startDate &&
      filters.endDate &&
      filters.startDate > filters.endDate
    ) {
      throw new BadRequestException('startDate must precede endDate');
    }
    if (filters.startDate)
      query.andWhere('movie.createdAt >= :startDate', {
        startDate: filters.startDate,
      });
    if (filters.endDate)
      query.andWhere('movie.createdAt <= :endDate', {
        endDate: filters.endDate,
      });
  }

  private filters(query: SelectQueryBuilder<Movie>, filters: GetRatingDto) {
    this.dates(query, filters);
    if (filters.search)
      query.andWhere('movie.title ILIKE :search', {
        search: '%' + filters.search + '%',
      });
    if (filters.isWatchTogether !== undefined) {
      query.andWhere('movie.isWatchedTogether = :watched', {
        watched: filters.isWatchTogether,
      });
    }
    if (filters.sortBy === MovieSortOption.USER_RATE && !filters.sortByUserId) {
      throw new BadRequestException(
        'sortByUserId is required for userRate sorting',
      );
    }
  }

  // Apply the same room visibility rules to ratings as to room detail reads.
  private visibleRooms() {
    return this.movieRepository.manager
      .getRepository(Room)
      .createQueryBuilder('visibleRoom')
      .select('visibleRoom.id')
      .leftJoin(
        'visibleRoom.users',
        'visibleMember',
        'visibleMember.id = :viewerId',
      )
      .where(
        '(visibleRoom.isPublic = true OR visibleRoom.owner = :viewerId OR visibleMember.id = :viewerId)',
      )
      .getQuery();
  }

  private withVisibleRatings(query: SelectQueryBuilder<Movie>) {
    const visibleRooms = this.visibleRooms();
    return query
      .leftJoin(
        'movie.ratings',
        'rating',
        'rating.room IN (' + visibleRooms + ')',
      )
      .leftJoin('rating.user', 'ratingUser')
      .addSelect([
        'rating.id',
        'rating.rate',
        'ratingUser.id',
        'ratingUser.username',
        'ratingUser.avatar',
      ])
      .setParameter('viewerId', this.request[REQUEST_USER_KEY].sub);
  }

  async getAll(filters: GetMovieDto) {
    const query = this.catalogueQuery()
      .orderBy('movie.createdAt', 'DESC')
      .addOrderBy('movie.id', 'DESC');
    this.dates(query, filters);
    return this.paginationProvider.paginateQuery(filters, query);
  }

  async getOne(id: string): Promise<Movie> {
    const movie = await this.catalogueQuery()
      .where('movie.id = :id', { id })
      .getOne();
    if (!movie) throw new NotFoundException('Movie not found');
    return movie;
  }

  getMovieWithMovieDbId(dbId: number): Promise<Movie | null> {
    return this.catalogueQuery().where('movie.dbId = :dbId', { dbId }).getOne();
  }

  async getAllWithRatings(filters: GetRatingDto) {
    const query = this.withVisibleRatings(this.catalogueQuery());
    this.filters(query, filters);
    const order = filters.sortOrder === SortOrder.ASC ? 'ASC' : 'DESC';
    if (filters.sortBy) {
      const aggregate = query
        .subQuery()
        .select(
          filters.sortBy === MovieSortOption.USER_RATE
            ? 'MAX(sortRating.rate)'
            : 'AVG(sortRating.rate)',
        )
        .from(Rating, 'sortRating')
        .where('sortRating.movie = movie.id')
        .andWhere('sortRating.room IN (' + this.visibleRooms() + ')');
      if (filters.sortBy === MovieSortOption.USER_RATE) {
        aggregate.andWhere('sortRating.user = :sortByUserId', {
          sortByUserId: filters.sortByUserId,
        });
      }
      query
        .addSelect(aggregate.getQuery(), 'sort_rate')
        .orderBy('sort_rate', order, 'NULLS LAST');
    }
    query.addOrderBy('movie.createdAt', 'DESC').addOrderBy('movie.id', 'DESC');
    const movies = await this.paginationProvider.paginateQuery(filters, query);
    const users = new Map<
      number,
      { id: number; username: string; avatar?: string }
    >();
    for (const movie of movies.data) {
      for (const rating of movie.ratings ?? []) {
        if (rating.user)
          users.set(rating.user.id, {
            id: rating.user.id,
            username: rating.user.username,
            avatar: rating.user.avatar,
          });
      }
    }
    return { movies, users: [...users.values()] };
  }

  async getOneWithRating(id: string): Promise<Movie> {
    const movie = await this.withVisibleRatings(this.catalogueQuery())
      .where('movie.id = :id', { id })
      .getOne();
    if (!movie) throw new NotFoundException('Movie not found');
    return movie;
  }

  async getMoviesRatingORoom(filters: GetRatingDto, roomId: number) {
    const userId = this.request[REQUEST_USER_KEY].sub;
    const users = await this.roomService.getRoomUsers(roomId);
    const query = this.movieRepository
      .createQueryBuilder('movie')
      .innerJoin('movie.rooms', 'room')
      .leftJoin('movie.ratings', 'rating', 'rating.room = :roomId', { roomId })
      .leftJoin('rating.user', 'rater')
      .leftJoin('movie.addedBy', 'addedBy')
      .where('room.id = :roomId', { roomId })
      .select('movie.id', 'id')
      .addSelect('movie.title', 'title')
      .addSelect('movie.poster_path', 'poster_path')
      .addSelect('movie.release_date', 'release_date')
      .addSelect('movie.isWatchedTogether', 'isWatchedTogether')
      .addSelect('movie.createdAt', 'createdAt')
      .addSelect('addedBy.id', 'addedById')
      .addSelect('addedBy.username', 'addedByUsername')
      .addSelect('addedBy.avatar', 'addedByAvatar')
      .addSelect('AVG(rating.rate)', 'averageRate')
      .groupBy('movie.id')
      .addGroupBy('addedBy.id');
    this.filters(query, filters);
    const order = filters.sortOrder === SortOrder.ASC ? 'ASC' : 'DESC';
    if (filters.sortBy === MovieSortOption.RATE)
      query.orderBy('"averageRate"', order, 'NULLS LAST');
    if (filters.sortBy === MovieSortOption.USER_RATE) {
      query
        .addSelect(
          'MAX(CASE WHEN rater.id = :sortByUserId THEN rating.rate END)',
          'userSpecificRate',
        )
        .setParameter('sortByUserId', filters.sortByUserId)
        .orderBy('"userSpecificRate"', order, 'NULLS LAST');
    }
    query.addOrderBy('movie.createdAt', 'DESC').addOrderBy('movie.id', 'DESC');
    const count = this.movieRepository
      .createQueryBuilder('movie')
      .innerJoin('movie.rooms', 'room')
      .where('room.id = :roomId', { roomId });
    this.filters(count, filters);
    const limit = filters.limit ?? 10;
    const page = filters.page ?? 1;
    const [totalItems, rows] = await Promise.all([
      count.getCount(),
      query
        .limit(limit)
        .offset((page - 1) * limit)
        .getRawMany<RoomMovieRow>(),
    ]);
    const ratings = await this.ratingsService.getRatingsOfRoomWithMovies(
      roomId,
      rows.map((row) => row.id),
    );
    const ratingMap = new Map(
      ratings.map((rating) => [
        rating.movie.id + ':' + rating.user.id,
        rating.rate,
      ]),
    );
    const totalPages = Math.ceil(totalItems / limit);
    return {
      data: rows.map((row) => ({
        id: row.id,
        title: row.title,
        poster_path: row.poster_path,
        release_date: row.release_date,
        isWatchedTogether: row.isWatchedTogether,
        createdAt: row.createdAt,
        addedBy: row.addedById
          ? {
              id: row.addedById,
              username: row.addedByUsername,
              avatar: row.addedByAvatar,
            }
          : null,
        averageRate: row.averageRate == null ? null : Number(row.averageRate),
        userSpecificRate:
          row.userSpecificRate == null ? null : Number(row.userSpecificRate),
        ratings: users.map((user) => ({
          user,
          rate: ratingMap.get(row.id + ':' + user.id) ?? null,
        })),
        hasVoted: ratingMap.has(row.id + ':' + userId),
      })),
      meta: { totalItems, itemsPerPage: limit, totalPages, currentPage: page },
      links: paginationLinks(this.request, limit, page, totalPages),
    };
  }
}
