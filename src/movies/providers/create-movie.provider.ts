import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
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

      const existingMovie = await this.movieRepository.findOne({
        where: {
          dbId: createMovieDto.dbId,
        },
      });

      if (existingMovie) {
        throw new ConflictException('Movie already exists');
      }

      const movie = this.movieRepository.create({
        ...createMovieDto,
        addedBy: { id: userPayload.sub },
      });

      const savedMovie = await this.movieRepository.save(movie);
      return savedMovie;
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to create movie');
    }
  }
}
