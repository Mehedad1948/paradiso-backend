import { Module } from '@nestjs/common';
import { RatingsController } from './ratings.controller';
import { RatingsService } from './providers/ratings.service';
import { AddRatingProvider } from './providers/add-rating.provider';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Rating } from './rating.entity';
import { UsersModule } from 'src/users/users.module';
import { MoviesModule } from 'src/movies/movies.module';
import { GetRatingProvider } from './providers/get-rating.provider';

@Module({
  controllers: [RatingsController],
  providers: [RatingsService, AddRatingProvider, GetRatingProvider],
  imports: [MoviesModule, UsersModule, TypeOrmModule.forFeature([Rating])],
})
export class RatingsModule {}
