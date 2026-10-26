import { AuthenticatedRequest } from '../../auth/interfaces/authenticated-request.interface';
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
import { REQUEST_USER_KEY } from '../../auth/constants/auth.constants';
import { PaginationProvider } from '../../common/pagination/providers/pagination.provider';
import { Repository } from 'typeorm';
import { GetRoomDto } from '../dtos/get-room.dto';
import { Room } from '../room.entity';
import { GetRoomRatingDto } from '../dtos/get-room-ratings';
import { MoviesService } from '../../movies/providers/movies.service';
import { RoomChatRead, RoomMessage } from '../../room-chat/room-message.entity';

@Injectable()
export class GetRoomProvider {
  constructor(
    @Inject(REQUEST) private readonly request: AuthenticatedRequest,
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
        .leftJoin('room.users', 'membership', 'membership.id = :userId', {
          userId,
        })
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
        query.where('(membership.id = :userId OR owner.id = :userId)', {
          userId,
        });
      } else {
        query
          .where('room.isPublic = :isPublic', { isPublic: true })
          .orWhere('membership.id = :userId OR owner.id = :userId', { userId });
      }

      const rooms = await this.paginationProvider.paginateQuery(
        {
          limit: roomQuery.limit,
          page: roomQuery.page,
        },
        query,
      );

      return {
        ...rooms,
        data: await this.withUnreadCounts(rooms.data, userId),
      };
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

  // Same rule as GET /rooms/:id/chat/unread: other people's undeleted
  // messages after the viewer's read position. Only members have a chat.
  private async withUnreadCounts(rooms: Room[], userId?: number) {
    const ids = rooms
      .filter(
        (room) =>
          room.owner?.id === userId ||
          room.users?.some((user) => user.id === userId),
      )
      .map((room) => room.id);
    const counts = new Map<number, number>();
    if (userId && ids.length) {
      const rows = await this.roomRepository.manager
        .getRepository(RoomMessage)
        .createQueryBuilder('message')
        .leftJoin(
          RoomChatRead,
          'chatRead',
          'chatRead.roomId = message.roomId AND chatRead.userId = :userId',
          { userId },
        )
        .select('message.roomId', 'roomId')
        .addSelect('COUNT(*)::int', 'count')
        .where('message.roomId IN (:...ids)', { ids })
        .andWhere('message.id > COALESCE(chatRead.lastReadMessageId, 0)')
        .andWhere('message.authorId != :userId')
        .andWhere('message.deletedAt IS NULL')
        .groupBy('message.roomId')
        .getRawMany<{ roomId: number; count: number }>();
      for (const row of rows) counts.set(row.roomId, row.count);
    }
    return rooms.map((room) =>
      Object.assign(room, { unreadCount: counts.get(room.id) ?? 0 }),
    );
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
          'room.themeColor',
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
        themeColor: room.themeColor ?? null,
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

  async getUnratedSummary(roomId: number) {
    try {
      return await this.movieService.getRoomUnratedSummary(roomId);
    } catch (error) {
      console.error('❌ Failed to get unrated summary:', error);
      throw new InternalServerErrorException(
        'Failed to fetch unrated movie summary',
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
