// add-rating.provider.ts
import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { REQUEST_USER_KEY } from 'src/auth/constants/auth.constants';
import { MoviesService } from 'src/movies/providers/movies.service';
import { RoomsService } from 'src/rooms/providers/rooms.service';
import { Room } from 'src/rooms/room.entity';
import { Repository } from 'typeorm';
import { AddRatingDto } from '../dtos/add-rating.dto';
import { Rating } from '../rating.entity';

@Injectable()
export class AddRatingProvider {
  constructor(
    @Inject(REQUEST) private readonly request: Request,

    @InjectRepository(Rating)
    private readonly ratingRepository: Repository<Rating>,

    private readonly movieService: MoviesService,

    @Inject(forwardRef(() => RoomsService))
    private readonly roomService: RoomsService,
  ) {}

  async addRating(roomId: number, addRatingDto: AddRatingDto) {
    const userPayload = this.request[REQUEST_USER_KEY];
    const userId = userPayload?.sub;

    const room = await this.roomService.findRoomById(roomId);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const movie = await this.movieService.getMovieById(addRatingDto.movieId);
    if (!movie) {
      throw new NotFoundException('Movie not found');
    }

    if (!room.movies.map((m) => m.id).includes(movie.id)) {
      throw new ConflictException('Movie is not in the room');
    }

    let rating = await this.ratingRepository.findOne({
      where: {
        user: { id: userId },
        movie: { id: movie.id },
        room: { id: room.id },
      },
    });

    if (rating) {
      rating.rate = addRatingDto.rate;

      await this.ratingRepository.save(rating);
    } else {
      rating = this.ratingRepository.create({
        user: { id: userId },
        movie,
        room: { id: room.id } as Room,
        rate: addRatingDto.rate,
      });

      await this.ratingRepository.save(rating);
    }

    return { rate: rating.rate, movie };
  }
}
