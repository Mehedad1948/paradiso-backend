import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { REQUEST_USER_KEY } from 'src/auth/constants/auth.constants';
import { PaginationProvider } from 'src/common/pagination/providers/pagination.provider';
import { Repository } from 'typeorm';
import { GetRoomDto } from '../dtos/get-room.dto';
import { Room } from '../room.entity';
import { GetRoomRatingDto } from '../dtos/get-room-ratings';
import { MoviesService } from 'src/movies/providers/movies.service';

@Injectable()
export class GetRoomProvider {
  constructor(
    @Inject(REQUEST) private readonly request: Request,
    @InjectRepository(Room)
    private readonly roomRepository: Repository<Room>,

    @Inject(forwardRef(() => MoviesService))
    private readonly movieService: MoviesService,

    private readonly paginationProvider: PaginationProvider,
  ) {}

  async getRooms(roomQuery: GetRoomDto) {
    try {
      const userPayload = this.request[REQUEST_USER_KEY];
      const userId = userPayload?.sub;

      const query = this.roomRepository
        .createQueryBuilder('room')
        .leftJoinAndSelect('room.users', 'user')
        .leftJoinAndSelect('room.movies', 'movie')
        .leftJoinAndSelect('room.owner', 'owner')
        .leftJoinAndSelect('movie.genres', 'genre')
        .select([
          'room',
          'user.id',
          'user.username',
          'user.avatar',
          'movie.id',
          'movie.title',
          'genre.id',
          'genre.name',
          'owner.id',
          'owner.username',
        ])
        .orderBy('room.id', 'DESC');

      if (roomQuery.usersRoom === 'true') {
        query.where('user.id = :userId', { userId });
      } else {
        query
          .where('room.isPublic = :isPublic', { isPublic: true })
          .orWhere('user.id = :userId', { userId });
      }

      const rooms = await this.paginationProvider.paginateQuery(
        {
          limit: roomQuery.limit,
          page: roomQuery.page,
        },
        query,
      );

      return rooms;
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to get rooms');
    }
  }

  async findRoomById(roomId: number) {
    const userPayload = this.request[REQUEST_USER_KEY];
    const userId = userPayload?.sub;
    try {
      const room = await this.roomRepository
        .createQueryBuilder('room')
        .select([
          'room.id',
          'room.name',
          'room.description',
          'room.image',
          'room.isPublic',
        ])

        .leftJoin('room.movies', 'movie')
        .addSelect(['movie.id', 'movie.title', 'movie.poster_path'])

        .leftJoin('room.users', 'user')
        .addSelect(['user.id', 'user.username', 'user.avatar'])

        .leftJoin('room.owner', 'owner')
        .addSelect(['owner.id', 'owner.username', 'owner.avatar'])

        .where('room.id = :roomId', { roomId })
        .getOne();
      if (!room) {
        return null;
      }

      if (room?.users?.length) {
        room.users.sort((a, b) =>
          a.id === userId ? -1 : b.id === userId ? 1 : 0,
        );
      }

      const resultRoom = {
        id: room.id,
        name: room.name,
        description: room.description,
        image: room.image,
        isPublic: room.isPublic,
        owner: room.owner,
        users: room.users,
        movies: room.movies,
      };

      return resultRoom;
    } catch (error) {
      console.error('Error in findRoomById:', error);
      throw new InternalServerErrorException('Failed to find room');
    }
  }

  async getRatingsOfRoom(ratingQuery: GetRoomRatingDto, roomId: number) {
    try {
      const paginatedRatings = await this.movieService.getMoviesRatingORoom(
        ratingQuery,
        roomId,
      );

      return paginatedRatings;
    } catch (error) {
      console.error('❌ Failed to get movies with ratings:', error);
      throw new InternalServerErrorException(
        'Failed to fetch movie list with ratings',
      );
    }
  }

  async getRoomUsers(roomId: number) {
    const userPayload = this.request[REQUEST_USER_KEY];
    const userId = userPayload?.sub;

    const roomUsers = await this.roomRepository
      .createQueryBuilder('room')
      .leftJoinAndSelect('room.users', 'user')
      .where('room.id = :roomId', { roomId })
      .select(['room.id', 'user.id', 'user.username', 'user.avatar'])
      .getOne();

    const usersInRoom = roomUsers?.users || [];

    // ✅ Move requesting user to the top
    usersInRoom.sort((a, b) =>
      a.id === userId ? -1 : b.id === userId ? 1 : 0,
    );

    return usersInRoom;
  }
}
