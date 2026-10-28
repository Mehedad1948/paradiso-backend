import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { UpdateMovieDto } from './dtos/update-movie.dto';
import { TmdbSearchDto } from './dtos/tmdb-search.dto';
import { Auth } from '../auth/decorator/auth.decorator';
import { AuthType } from '../auth/enums/auth.decorator';
import { CreateMovieDto } from './dtos/create-movie.dto';
import { GetMovieDto } from './dtos/get-movie.dto';
import { MovieDbService } from './providers/MovieDb.serviec';
import { MoviesService } from './providers/movies.service';
import { ResolveMovieDto } from './dtos/resolve-movie.dto';
import { ActiveUser } from '../auth/decorator/active-user.decorator';

@Controller('movies')
export class MoviesController {
  constructor(
    private readonly movieService: MoviesService,
    private readonly movieDbService: MovieDbService,
  ) {}

  // Local DB: Get all movies
  @Get()
  @Auth(AuthType.none)
  async getMovies(@Query() movieQuery: GetMovieDto) {
    return await this.movieService.getAllMovies(movieQuery);
  }

  // Local DB: Get one movie by ID
  @Get(':id')
  @Auth(AuthType.none)
  async getMovieById(@Param('id', ParseUUIDPipe) id: string) {
    return await this.movieService.getMovieById(id);
  }

  // Local DB: Everything the movie details screen shows, in one small read.
  // Lists stay lean; clients load this when a poster is opened.
  @Get(':id/details')
  @Auth(AuthType.none)
  async getMovieDetails(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { details, complete } = await this.movieService.getMovieDetails(id);
    // Catalogue data rarely changes; let clients and CDNs reuse it, except
    // while the stored details are still missing.
    res.setHeader(
      'Cache-Control',
      complete
        ? 'public, max-age=3600, stale-while-revalidate=86400'
        : 'no-store',
    );
    return details;
  }

  // Our ID for a TMDb film, importing it on first use. Idempotent, so
  // repeated or concurrent calls for one film return the same movie.
  @Post('resolve')
  @HttpCode(HttpStatus.OK)
  @Auth(AuthType.Bearer)
  async resolveMovie(
    @Body() { tmdbId }: ResolveMovieDto,
    @ActiveUser('sub') userId: number,
  ) {
    const { id } = await this.movieService.resolveMovie(tmdbId, userId);
    return { id };
  }

  // Local DB: Update movie
  @Put(':id')
  @Auth(AuthType.Bearer)
  async updateMovieById(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() createMovieDto: UpdateMovieDto,
  ) {
    return await this.movieService.updateMovie(id, createMovieDto);
  }

  // Local DB: Create movie
  @Post()
  @Auth(AuthType.Bearer)
  async createMovie(@Body() createMovieDto: CreateMovieDto) {
    return await this.movieService.createMovie(createMovieDto);
  }

  // TMDb: Search movies (no auth)
  @Get('/tmdb/search')
  @Auth(AuthType.none)
  async searchMoviesFromTmdb(@Query() query: TmdbSearchDto) {
    return await this.movieDbService.searchMovies(query.query, query.page);
  }

  // TMDb: Get genres (no auth)
  @Get('/tmdb/genres')
  @Auth(AuthType.none)
  async getTmdbGenres() {
    return await this.movieDbService.getGenres();
  }

  // TMDb: Get movie details (no auth)
  @Get('/tmdb/:movieId')
  @Auth(AuthType.none)
  async getTmdbMovieDetails(@Param('movieId', ParseIntPipe) movieId: number) {
    return await this.movieDbService.getMovieDetails(movieId);
  }
}
