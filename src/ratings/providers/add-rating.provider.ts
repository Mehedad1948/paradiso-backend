import { AuthenticatedRequest } from '../../auth/interfaces/authenticated-request.interface';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { REQUEST_USER_KEY } from '../../auth/constants/auth.constants';
import { Room } from '../../rooms/room.entity';
import { lockRoom } from '../../rooms/providers/room-transaction';
import { Repository } from 'typeorm';
import { AddRatingDto } from '../dtos/add-rating.dto';
import { Rating } from '../rating.entity';
import { Movie } from '../../movies/movie.entity';

@Injectable()
export class AddRatingProvider {
  constructor(
    @Inject(REQUEST) private readonly request: AuthenticatedRequest,
    @InjectRepository(Rating)
    private readonly ratingRepository: Repository<Rating>,
  ) {}
  async addRating(roomId: number, dto: AddRatingDto) {
    const userId = this.request[REQUEST_USER_KEY].sub;
    return this.ratingRepository.manager.transaction(async (manager) => {
      await lockRoom(manager, roomId);
      const inRoom = await manager
        .getRepository(Room)
        .exists({ where: { id: roomId, movies: { id: dto.movieId } } });
      if (!inRoom) throw new ConflictException('Movie is not in the room');
      await manager.getRepository(Rating).upsert(
        {
          user: { id: userId },
          movie: { id: dto.movieId },
          room: { id: roomId },
          rate: dto.rate,
        },
        ['user', 'movie', 'room'],
      );
      const movie = await manager
        .getRepository(Movie)
        .createQueryBuilder('movie')
        .leftJoin('movie.addedBy', 'addedBy')
        .select(['movie', 'addedBy.id', 'addedBy.username', 'addedBy.avatar'])
        .where('movie.id = :id', { id: dto.movieId })
        .getOne();
      return { rate: dto.rate, movie };
    });
  }
}
