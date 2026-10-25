import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Movie } from '../movies/movie.entity';
import { User } from '../users/user.entity';
import { FavoriteMovie } from './favorite-movie.entity';
import { FavoritesService } from './favorites.service';
import { FavoritesController } from './favorites.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FavoriteMovie, Movie, User])],
  controllers: [FavoritesController],
  providers: [FavoritesService],
})
export class FavoritesModule {}
