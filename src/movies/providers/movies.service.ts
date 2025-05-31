import { Injectable } from '@nestjs/common';
import { CreateMovieProvider } from './create-movie.provider';
import { GetMovieProvider } from './get-movie.provider';
import { CreateMovieDto } from '../dtos/create-movie.dto';
import { Movie } from '../movie.entity';
import { UpdateMovieProvider } from './update-movie.provider';
import { MovieResponseDto } from '../dtos/movie-response.dto';
import { GetMovieDto } from '../dtos/get-movie.dto';
import { Paginated } from 'src/common/pagination/interfaces/paginated.interface';

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

  public async getAllMovies(
    movieQuery: GetMovieDto,
  ): Promise<Paginated<Movie>> {
    return await this.getMovieProvider.getAll(movieQuery);
  }

  public async getAllMoviesWithRating(): Promise<Movie[]> {
    return await this.getMovieProvider.getAllWithRatings();
  }

  public async getMovieById(id: string): Promise<Movie> {
    return await this.getMovieProvider.getOne(id);
  }

  public async getMovieByIdWithRating(id: string): Promise<Movie> {
    return await this.getMovieProvider.getOneWithRating(id);
  }
}
