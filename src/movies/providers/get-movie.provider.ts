import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Movie } from '../movie.entity';

@Injectable()
export class GetMovieProvider {
  constructor(
    @InjectRepository(Movie)
    private readonly movieRepository: Repository<Movie>,
  ) {}

  async getAll(): Promise<Movie[]> {
    try {
      return await this.movieRepository
        .createQueryBuilder('movie')
        .leftJoinAndSelect('movie.addedBy', 'user')
        .select(['movie', 'user.id', 'user.username', 'user.avatar'])
        .getMany();
    } catch (error) {
      console.error('❌ Failed to get all movies:', error);
      throw new InternalServerErrorException('Failed to get movies');
    }
  }

  async getOne(id: string): Promise<Movie> {
    try {
      const movie = await this.movieRepository
        .createQueryBuilder('movie')
        .leftJoinAndSelect('movie.addedBy', 'user')
        .select(['movie', 'user.id', 'user.username', 'user.avatar'])
        .where('movie.id = :id', { id })
        .getOne();

      if (!movie) {
        throw new NotFoundException(`Movie with id ${id} not found`);
      }

      return movie;
    } catch (error) {
      console.error(`❌ Failed to get movie with id ${id}:`, error);
      throw error instanceof NotFoundException
        ? error
        : new InternalServerErrorException('Failed to get movie');
    }
  }
}
