import { Module } from '@nestjs/common';
import { RatingsController } from './ratings.controller';
import { RatingsService } from './providers/ratings.service';
import { AddRatingProvider } from './providers/add-rating.provider';

@Module({
  controllers: [RatingsController],
  providers: [RatingsService, AddRatingProvider],
})
export class RatingsModule {}
