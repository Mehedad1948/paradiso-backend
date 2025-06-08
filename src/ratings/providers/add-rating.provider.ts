// add-rating.provider.ts
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { REQUEST_USER_KEY } from 'src/auth/constants/auth.constants';
import { MoviesService } from 'src/movies/providers/movies.service';
import { UsersService } from 'src/users/providers/users.service';
import { Repository } from 'typeorm';
import { Rating } from '../rating.entity';
import { AddRatingDto } from '../dtos/add-rating.dto';
import { RoomsService } from 'src/rooms/providers/rooms.service';
import { Room } from 'src/rooms/room.entity';

@Injectable()
export class AddRatingProvider {
  constructor(
    @Inject(REQUEST) private readonly request: Request,

    @InjectRepository(Rating)
    private readonly ratingRepository: Repository<Rating>,

    private readonly userService: UsersService,

    private readonly movieService: MoviesService,

    private readonly roomService: RoomsService,
  ) {}

  async addRating(movieId: string, addRatingDto: AddRatingDto) {
    const userPayload = this.request[REQUEST_USER_KEY];
    if (!userPayload?.sub) {
      throw new NotFoundException('User not found in request payload');
    }

    console.log('🚀🚀🚀', addRatingDto.roomId);

    const room = await this.roomService.findRoomById(addRatingDto.roomId);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    if (!room.users.includes(userPayload.sub)) {
      throw new UnauthorizedException('User is not a member of the room');
    }

    const user = await this.userService.findOneById(userPayload.sub);
    if (!user) {
      throw new NotFoundException('User not found in database');
    }

    const movie = await this.movieService.getMovieById(movieId);
    if (!movie) {
      throw new NotFoundException('Movie not found');
    }

    if (!room.movies.includes(movie.id)) {
      throw new ConflictException('Movie is not in the room');
    }

    // if (room.users.includes(user.id)) {
    //   throw new UnauthorizedException('User is not a member of the room');
    // }

    let rating = await this.ratingRepository.findOne({
      where: {
        user: { id: user.id },
        movie: { id: movie.id },
        room: { id: room.id },
      },
    });

    if (rating) {
      rating.rate = addRatingDto.rate;
    } else {
      rating = this.ratingRepository.create({
        user,
        movie,
        room: { id: room.id } as Room,
        rate: addRatingDto.rate,
      });
    }

    return { rate: rating.rate, movie };
  }
}
