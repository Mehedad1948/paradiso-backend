import { forwardRef, Module } from '@nestjs/common';
import { MoviesController } from './movies.controller';
import { MoviesService } from './providers/movies.service';
import { CreateMovieProvider } from './providers/create-movie.provider';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Movie } from './movie.entity';
import { ContentBlock } from './content-block.entity';
import { ContentBlocksService } from './providers/content-blocks.service';
import { GetMovieProvider } from './providers/get-movie.provider';
import { UpdateMovieProvider } from './providers/update-movie.provider';
import { PaginationModule } from '../common/pagination/dtos/pagination.module';
import { UsersModule } from '../users/users.module';
import { MovieDbService } from './providers/MovieDb.serviec';
import { GenresModule } from '../genres/genres.module';
import { RoomsModule } from '../rooms/rooms.module';
import { RatingsModule } from '../ratings/ratings.module';
import { MovieDetailsProvider } from './providers/movie-details.provider';
import { ResolveMovieProvider } from './providers/resolve-movie.provider';

@Module({
  controllers: [MoviesController],
  providers: [
    MoviesService,
    CreateMovieProvider,
    GetMovieProvider,
    UpdateMovieProvider,
    MovieDbService,
    MovieDetailsProvider,
    ResolveMovieProvider,
    ContentBlocksService,
  ],
  imports: [
    TypeOrmModule.forFeature([Movie, ContentBlock]),
    forwardRef(() => RoomsModule),
    forwardRef(() => RatingsModule),
    PaginationModule,
    UsersModule,
    GenresModule,
  ],
  exports: [
    MoviesService,
    MovieDbService,
    ResolveMovieProvider,
    ContentBlocksService,
  ],
})
export class MoviesModule {}
