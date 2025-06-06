import { Body, Controller, Get, Post, Param, Put, Query } from '@nestjs/common';
import { CreateMovieDto } from './dtos/create-movie.dto';
import { MoviesService } from './providers/movies.service';
import { Auth } from 'src/auth/decorator/auth.decorator';
import { AuthType } from 'src/auth/enums/auth.decorator';
import { GetMovieDto } from './dtos/get-movie.dto';
import { MovieDbService } from './providers/MovieDb.serviec';

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
  async getMovieById(@Param('id') id: string) {
    return await this.movieService.getMovieById(id);
  }

  // Local DB: Update movie
  @Put(':id')
  @Auth(AuthType.Bearer)
  async updateMovieById(
    @Param('id') id: string,
    @Body() createMovieDto: CreateMovieDto,
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
  async searchMoviesFromTmdb(
    @Query('query') query: string,
    @Query('page') page = 1,
  ) {
    return await this.movieDbService.searchMovies(query, page);
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
  async getTmdbMovieDetails(@Param('movieId') movieId: number) {
    return await this.movieDbService.getMovieDetails(movieId);
  }
}
