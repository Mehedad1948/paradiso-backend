import { Module } from '@nestjs/common';
import { MoviesController } from './movies.controller';
import { MoviesService } from './providers/movies.service';
import { CreateMovieProvider } from './providers/create-movie.provider';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Movie } from './movie.entity';
import { GetMovieProvider } from './providers/get-movie.provider';

@Module({
  controllers: [MoviesController],
  providers: [MoviesService, CreateMovieProvider, GetMovieProvider],
  imports: [TypeOrmModule.forFeature([Movie])],
})
export class MoviesModule {}
