import { Injectable } from '@nestjs/common';
import { CreateMovieProvider } from './create-movie.provider';
import { GetMovieProvider } from './get-movie.provider';
import { CreateMovieDto } from '../dtos/create-movie.dto';
import { UpdateMovieDto } from '../dtos/update-movie.dto';
import { Movie } from '../movie.entity';
import { UpdateMovieProvider } from './update-movie.provider';
import { MovieResponseDto } from '../dtos/movie-response.dto';
import { GetMovieDto } from '../dtos/get-movie.dto';
import { Paginated } from '../../common/pagination/interfaces/paginated.interface';
import { GetRatingDto } from '../../ratings/dtos/get-rating.dto';
import { GetRoomRatingDto } from '../../rooms/dtos/get-room-ratings';
import { MovieExtras } from '../tmdb-extras';
import { MovieDetailsProvider } from './movie-details.provider';

@Injectable()
export class MoviesService {
  constructor(
    private readonly createMovieProvider: CreateMovieProvider,
    private readonly getMovieProvider: GetMovieProvider,
    private readonly updateMovieProvider: UpdateMovieProvider,
    private readonly movieDetailsProvider: MovieDetailsProvider,
  ) {}

  public async createMovie(
    createMovieDto: CreateMovieDto,
    extras?: MovieExtras,
  ): Promise<Movie> {
    return await this.createMovieProvider.createMovie(createMovieDto, extras);
  }

  public async getMovieDetails(id: string) {
    return await this.movieDetailsProvider.getDetails(id);
  }

  public async updateMovie(
    id: string,
    createMovieDto: UpdateMovieDto,
  ): Promise<MovieResponseDto> {
    return await this.updateMovieProvider.update(id, createMovieDto);
  }

  public async getAllMovies(
    movieQuery: GetMovieDto,
  ): Promise<Paginated<Movie>> {
    return await this.getMovieProvider.getAll(movieQuery);
  }

  public async getAllMoviesWithRating(ratingQuery: GetRatingDto) {
    return await this.getMovieProvider.getAllWithRatings(ratingQuery);
  }

  public async getMovieById(id: string): Promise<Movie> {
    return await this.getMovieProvider.getOne(id);
  }

  public async getMovieWithMovieDbId(dbId: number): Promise<Movie | null> {
    return await this.getMovieProvider.getMovieWithMovieDbId(dbId);
  }

  public async getMovieByIdWithRating(id: string): Promise<Movie> {
    return await this.getMovieProvider.getOneWithRating(id);
  }

  public async getRoomUnratedSummary(roomId: number) {
    return await this.getMovieProvider.getRoomUnratedSummary(roomId);
  }

  public async getMoviesRatingORoom(
    getRatingDto: GetRoomRatingDto,
    roomId: number,
  ) {
    return await this.getMovieProvider.getMoviesRatingORoom(
      getRatingDto,
      roomId,
    );
  }
}
