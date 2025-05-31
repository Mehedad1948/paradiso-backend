import { Injectable } from '@nestjs/common';
import { AddRatingProvider } from './add-rating.provider';
import { AddRatingDto } from '../dtos/add-rating.dto';
import { GetRatingProvider } from './get-rating.provider';

@Injectable()
export class RatingsService {
  constructor(
    private readonly addRatingProvider: AddRatingProvider,

    private readonly getRatingProvider: GetRatingProvider,
  ) {}
  async addRating(movieId: string, addRateDto: AddRatingDto) {
    return await this.addRatingProvider.addRating(movieId, addRateDto.rate);
  }

  async getAllRating() {
    return await this.getRatingProvider.getAllMoviesWithRatings();
  }
  async getOneRating(movieId: string) {
    return await this.getRatingProvider.getOne(movieId);
  }
}
