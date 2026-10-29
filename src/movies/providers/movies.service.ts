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
import { ResolvedMovie, ResolveMovieProvider } from './resolve-movie.provider';
import { ContentBlocksService } from './content-blocks.service';

@Injectable()
export class MoviesService {
  constructor(
    private readonly createMovieProvider: CreateMovieProvider,
    private readonly getMovieProvider: GetMovieProvider,
    private readonly updateMovieProvider: UpdateMovieProvider,
    private readonly movieDetailsProvider: MovieDetailsProvider,
    private readonly resolveMovieProvider: ResolveMovieProvider,
    private readonly contentBlocks: ContentBlocksService,
  ) {}

  public resolveMovie(
    tmdbId: number,
    userId: number,
    isWatchedTogether = false,
  ): Promise<ResolvedMovie> {
    return this.resolveMovieProvider.resolve(tmdbId, userId, isWatchedTogether);
  }

  public async createMovie(
    createMovieDto: CreateMovieDto,
    extras?: MovieExtras,
  ): Promise<Movie> {
    return await this.createMovieProvider.createMovie(createMovieDto, extras);
  }

  // Blocked people are left out of the credits; the stored row keeps them,
  // so unblocking someone needs no refresh.
  public async getMovieDetails(id: string) {
    const result = await this.movieDetailsProvider.getDetails(id);
    const { details } = result;
    const blocked = await this.contentBlocks.blocked('person', [
      ...details.cast.map((member) => member.id ?? 0),
      ...details.directors.map((member) => member.id),
      ...details.crew.map((member) => member.id),
    ]);
    if (!blocked.size) return result;
    const keep = (member: { id: number | null }) =>
      member.id === null || !blocked.has(member.id);
    return {
      ...result,
      details: {
        ...details,
        cast: details.cast.filter(keep),
        directors: details.directors.filter(keep),
        crew: details.crew.filter(keep),
      },
    };
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
