// add-rating.provider.ts
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { REQUEST_USER_KEY } from 'src/auth/constants/auth.constants';
import { MoviesService } from 'src/movies/providers/movies.service';
import { UsersService } from 'src/users/providers/users.service';
import { Repository } from 'typeorm';
import { Rating } from '../rating.entity';

@Injectable()
export class AddRatingProvider {
  constructor(
    @Inject(REQUEST) private readonly request: Request,

    @InjectRepository(Rating)
    private readonly ratingRepository: Repository<Rating>,

    private readonly userService: UsersService,

    private readonly movieService: MoviesService,
  ) {}

  async addRating(movieId: string, rate: number): Promise<Rating> {
    const userPayload = this.request[REQUEST_USER_KEY];
    if (!userPayload?.sub) {
      throw new NotFoundException('User not found in request payload');
    }

    const user = await this.userService.findOneById(userPayload.sub);
    if (!user) {
      throw new NotFoundException('User not found in database');
    }

    const movie = await this.movieService.getMovieById(movieId);
    if (!movie) {
      throw new NotFoundException('Movie not found');
    }

    let rating = await this.ratingRepository.findOne({
      where: {
        user: { id: user.id },
        movie: { id: movie.id },
      },
    });

    if (rating) {
      rating.rate = rate;
    } else {
      rating = this.ratingRepository.create({
        user,
        movie,
        rate,
      });
    }

    return this.ratingRepository.save(rating);
  }
}
