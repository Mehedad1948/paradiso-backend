import { forwardRef, Module } from '@nestjs/common';
import { RatingsController } from './ratings.controller';
import { RatingsService } from './providers/ratings.service';
import { AddRatingProvider } from './providers/add-rating.provider';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Rating } from './rating.entity';
import { UsersModule } from '../users/users.module';
import { MoviesModule } from '../movies/movies.module';
import { GetRatingProvider } from './providers/get-rating.provider';
import { RoomsModule } from '../rooms/rooms.module';
import { DeleteRatingProvider } from './providers/delete-rating.provider';
import { PaginationModule } from '../common/pagination/dtos/pagination.module';

@Module({
  controllers: [RatingsController],
  providers: [
    RatingsService,
    AddRatingProvider,
    GetRatingProvider,
    DeleteRatingProvider,
  ],
  exports: [RatingsService],
  imports: [
    forwardRef(() => MoviesModule),
    UsersModule,
    PaginationModule,
    forwardRef(() => RoomsModule),
    TypeOrmModule.forFeature([Rating]),
  ],
})
export class RatingsModule {}
