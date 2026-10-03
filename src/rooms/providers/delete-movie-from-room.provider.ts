import { AuthenticatedRequest } from '../../auth/interfaces/authenticated-request.interface';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { REQUEST_USER_KEY } from '../../auth/constants/auth.constants';
import { Movie } from '../../movies/movie.entity';
import { Rating } from '../../ratings/rating.entity';
import { Repository } from 'typeorm';
import { Room } from '../room.entity';
import { lockRoom } from './room-transaction';

@Injectable()
export class DeleteMovieFromRoomProvider {
  constructor(
    @Inject(REQUEST) private readonly request: AuthenticatedRequest,
    @InjectRepository(Room) private readonly roomRepository: Repository<Room>,
  ) {}
  async delete(roomId: number, movieId: string) {
    const user = this.request[REQUEST_USER_KEY];
    return this.roomRepository.manager.transaction(async (manager) => {
      await lockRoom(manager, roomId);
      const room = await manager
        .getRepository(Room)
        .findOne({ where: { id: roomId }, relations: ['owner'] });
      const inRoom = await manager
        .getRepository(Room)
        .exists({ where: { id: roomId, movies: { id: movieId } } });
      if (!inRoom) throw new ConflictException('Movie is not in the room');
      const movie = await manager
        .getRepository(Movie)
        .findOne({ where: { id: movieId }, relations: ['addedBy'] });
      if (
        user.role !== 'admin' &&
        movie?.addedBy?.id !== user.sub &&
        room?.owner?.id !== user.sub
      ) {
        throw new ForbiddenException(
          'You do not have permission to remove this movie',
        );
      }
      await manager
        .getRepository(Rating)
        .delete({ movie: { id: movieId }, room: { id: roomId } });
      await manager
        .createQueryBuilder()
        .relation(Room, 'movies')
        .of(roomId)
        .remove(movieId);
      return { message: 'Movie removed from room successfully.' };
    });
  }
}
