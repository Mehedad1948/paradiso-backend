import { forwardRef, Module } from '@nestjs/common';
import { MoviesController } from './movies.controller';
import { MoviesService } from './providers/movies.service';
import { CreateMovieProvider } from './providers/create-movie.provider';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Movie } from './movie.entity';
import { GetMovieProvider } from './providers/get-movie.provider';
import { UpdateMovieProvider } from './providers/update-movie.provider';
import { PaginationModule } from 'src/common/pagination/dtos/pagination.module';
import { UsersModule } from 'src/users/users.module';
import { MovieDbService } from './providers/MovieDb.serviec';
import { GenresModule } from 'src/genres/genres.module';
import { RoomsModule } from 'src/rooms/rooms.module';
import { RatingsModule } from 'src/ratings/ratings.module';

@Module({
  controllers: [MoviesController],
  providers: [
    MoviesService,
    CreateMovieProvider,
    GetMovieProvider,
    UpdateMovieProvider,
    MovieDbService,
  ],
  imports: [
    TypeOrmModule.forFeature([Movie]),
    forwardRef(() => RoomsModule),
    forwardRef(() => RatingsModule),
    PaginationModule,
    UsersModule,
    GenresModule,
  ],
  exports: [MoviesService, MovieDbService],
})
export class MoviesModule {}
