import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { REQUEST_USER_KEY } from 'src/auth/constants/auth.constants';
import { Repository } from 'typeorm';
import { UpdateMovieDto } from '../dtos/update-movie.dto';
import { Movie } from '../movie.entity';
import { MovieResponseDto } from '../dtos/movie-response.dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class UpdateMovieProvider {
  constructor(
    @Inject(REQUEST) private readonly request: Request,
    @InjectRepository(Movie)
    private readonly movieRepository: Repository<Movie>,
  ) {}

  async update(
    id: string,
    updateDto: UpdateMovieDto,
  ): Promise<MovieResponseDto> {
    try {
      const userPayload = this.request[REQUEST_USER_KEY];

      if (!userPayload || !userPayload.sub || !userPayload.role) {
        throw new UnauthorizedException('User payload missing or invalid');
      }

      const movie = await this.movieRepository.findOne({
        where: { id },
        relations: ['addedBy'],
      });

      if (!movie) {
        throw new NotFoundException(`Movie with ID ${id} not found`);
      }

      // Allow update if user is admin or the creator
      const isOwner = movie.addedBy?.id === userPayload.sub;
      const isAdmin = userPayload.role === 'admin';

      if (!isOwner && !isAdmin) {
        throw new UnauthorizedException(
          'You are not allowed to update this movie',
        );
      }

      const updatedMovie = this.movieRepository.merge(movie, updateDto);
      const savedMovie = await this.movieRepository.save(updatedMovie);
      return plainToInstance(MovieResponseDto, savedMovie, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      console.error(`❌ Failed to update movie:`, error);
      throw error instanceof UnauthorizedException ||
        error instanceof NotFoundException
        ? error
        : new InternalServerErrorException('Failed to update movie');
    }
  }
}
