import {
  ConflictException,
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

@Injectable()
export class GetRoomProvider {
  constructor(
    @Inject(REQUEST) private readonly request: Request,
    @InjectRepository(Room)
    private readonly roomRepository: Repository<Room>,

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
}
