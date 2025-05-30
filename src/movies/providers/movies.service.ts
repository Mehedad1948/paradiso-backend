import { Injectable } from '@nestjs/common';
import { CreateMovieProvider } from './create-movie.provider';
import { GetMovieProvider } from './get-movie.provider';
import { CreateMovieDto } from '../dtos/create-movie.dto';
import { Movie } from '../movie.entity';

@Injectable()
export class MoviesService {
  constructor(
    private readonly createMovieProvider: CreateMovieProvider,
    private readonly getMovieProvider: GetMovieProvider,
  ) {}

  public async createMovie(createMovieDto: CreateMovieDto): Promise<Movie> {
    return await this.createMovieProvider.createMovie(createMovieDto);
  }

  public async getAllMovies(): Promise<Movie[]> {
    return await this.getMovieProvider.getAll();
  }

  public async getMovieById(id: string): Promise<Movie> {
    return await this.getMovieProvider.getOne(id);
  }
}
