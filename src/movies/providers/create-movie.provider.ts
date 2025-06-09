import {
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { REQUEST_USER_KEY } from 'src/auth/constants/auth.constants';
import { Repository } from 'typeorm';
import { CreateMovieDto } from '../dtos/create-movie.dto';
import { Movie } from '../movie.entity';

@Injectable()
export class CreateMovieProvider {
  constructor(
    @Inject(REQUEST) private readonly request: Request,
    @InjectRepository(Movie)
    private readonly movieRepository: Repository<Movie>,
  ) {}

  async createMovie(createMovieDto: CreateMovieDto): Promise<Movie> {
    try {
      const userPayload = this.request[REQUEST_USER_KEY];

      if (!userPayload || !userPayload.sub) {
        throw new UnauthorizedException('User payload missing');
      }

      const movie = this.movieRepository.create({
        ...createMovieDto,
        addedBy: { id: userPayload.sub },
      });

      const savedMovie = await this.movieRepository.save(movie);
      return savedMovie;
    } catch (error) {
      console.error('❌ Failed to create movie:', error);
      throw new InternalServerErrorException('Failed to create movie');
    }
  }
}
