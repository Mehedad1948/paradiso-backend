import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoviesService } from 'src/movies/providers/movies.service';
import { RatingsService } from 'src/ratings/providers/ratings.service';
import { Repository } from 'typeorm';
import { Room } from '../room.entity';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { REQUEST_USER_KEY } from 'src/auth/constants/auth.constants';

@Injectable()
export class DeleteMovieFromRoomProvider {
  constructor(
    @Inject(REQUEST) private readonly request: Request,
    private readonly movieService: MoviesService,

    @Inject(forwardRef(() => RatingsService))
    private readonly ratingsService: RatingsService,

    @InjectRepository(Room)
    private readonly roomRepository: Repository<Room>,
  ) {}

  async delete(roomId: number, movieId: string) {
    const userPayload = this.request[REQUEST_USER_KEY];
    const userId = userPayload.id;
    const role = userPayload.role;

    const room = await this.roomRepository.findOne({
      where: { id: roomId },
      relations: ['movies', 'movies.addedBy'],
    });

    if (!room) {
      throw new NotFoundException('Room was not found.');
    }

    const movie = room.movies.find((m) => m.id === movieId);
    if (!movie) {
      throw new ConflictException('Movie is not in the room.');
    }

    if (
      role !== 'admin' &&
      movie.addedBy.id !== userId &&
      room.owner.id !== userId
    ) {
      throw new ConflictException(
        'You do not have permission to remove this movie.',
      );
    }

    await this.ratingsService.deleteRatingWithMovieAndRoom(roomId, movieId);

    room.movies = room.movies.filter((roomMovie) => roomMovie.id !== movieId);
    await this.roomRepository.save(room);

    return {
      message: `Movie "${movie.title}" removed from room successfully.`,
    };
  }
}
