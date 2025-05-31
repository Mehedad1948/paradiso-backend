import { Module } from '@nestjs/common';
import { MoviesController } from './movies.controller';
import { MoviesService } from './providers/movies.service';
import { CreateMovieProvider } from './providers/create-movie.provider';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Movie } from './movie.entity';
import { GetMovieProvider } from './providers/get-movie.provider';
import { UpdateMovieProvider } from './providers/update-movie.provider';

@Module({
  controllers: [MoviesController],
  providers: [
    MoviesService,
    CreateMovieProvider,
    GetMovieProvider,
    UpdateMovieProvider,
  ],
  imports: [TypeOrmModule.forFeature([Movie])],
  exports: [MoviesService],
})
export class MoviesModule {}
