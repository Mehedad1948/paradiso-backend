import { Injectable } from '@nestjs/common';
import { CreateMovieProvider } from './create-movie.provider';
import { GetMovieProvider } from './get-movie.provider';
import { CreateMovieDto } from '../dtos/create-movie.dto';
import { Movie } from '../movie.entity';
import { UpdateMovieProvider } from './update-movie.provider';
import { MovieResponseDto } from '../dtos/movie-response.dto';

@Injectable()
export class MoviesService {
  constructor(
    private readonly createMovieProvider: CreateMovieProvider,
    private readonly getMovieProvider: GetMovieProvider,
    private readonly updateMovieProvider: UpdateMovieProvider,
  ) {}

  public async createMovie(
    createMovieDto: CreateMovieDto,
  ): Promise<MovieResponseDto> {
    return await this.createMovieProvider.createMovie(createMovieDto);
  }

  public async updateMovie(
    id: string,
    createMovieDto: CreateMovieDto,
  ): Promise<MovieResponseDto> {
    return await this.updateMovieProvider.update(id, createMovieDto);
  }

  public async getAllMovies(): Promise<Movie[]> {
    return await this.getMovieProvider.getAll();
  }

  public async getMovieById(id: string): Promise<Movie> {
    return await this.getMovieProvider.getOne(id);
  }
}
