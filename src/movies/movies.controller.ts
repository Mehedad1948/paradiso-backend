import { Body, Controller, Get, Post, Param, Put, Query } from '@nestjs/common';
import { CreateMovieDto } from './dtos/create-movie.dto';
import { MoviesService } from './providers/movies.service';
import { Auth } from 'src/auth/decorator/auth.decorator';
import { AuthType } from 'src/auth/enums/auth.decorator';
import { GetMovieDto } from './dtos/get-movie.dto';

@Controller('movies')
export class MoviesController {
  constructor(private readonly movieService: MoviesService) {}

  // Get all movies, no auth required
  @Get()
  @Auth(AuthType.none)
  async getMovies(@Query() movieQuery: GetMovieDto) {
    return await this.movieService.getAllMovies(movieQuery);
  }

  // Get one movie by ID, no auth required (adjust if needed)
  @Get(':id')
  @Auth(AuthType.none)
  async getMovieById(@Param('id') id: string) {
    return await this.movieService.getMovieById(id);
  }

  @Put(':id')
  @Auth(AuthType.Bearer)
  async updateMovieById(
    @Param('id') id: string,
    @Body() createMovieDto: CreateMovieDto,
  ) {
    return await this.movieService.updateMovie(id, createMovieDto);
  }

  // Create movie, requires Bearer auth
  @Post()
  @Auth(AuthType.Bearer)
  async createMovie(@Body() createMovieDto: CreateMovieDto) {
    return await this.movieService.createMovie(createMovieDto);
  }
}
