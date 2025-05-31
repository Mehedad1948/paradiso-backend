// add-rating.provider.ts
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/users/user.entity';
import { Movie } from 'src/movies/movie.entity';
import { Rating } from '../rating.entity';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { REQUEST_USER_KEY } from 'src/auth/constants/auth.constants';

@Injectable()
export class AddRatingProvider {
  constructor(
    @Inject(REQUEST) private readonly request: Request,

    @InjectRepository(Rating)
    private readonly ratingRepository: Repository<Rating>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Movie)
    private readonly movieRepository: Repository<Movie>,
  ) {}

  async addRating(movieId: string, rate: number): Promise<Rating> {
    const userPayload = this.request[REQUEST_USER_KEY];
    if (!userPayload?.sub) {
      throw new NotFoundException('User not found in request payload');
    }

    const user = await this.userRepository.findOne({
      where: { id: userPayload.sub },
    });
    if (!user) {
      throw new NotFoundException('User not found in database');
    }

    const movie = await this.movieRepository.findOne({
      where: { id: movieId },
    });
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
