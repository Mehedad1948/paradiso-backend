import { Injectable } from '@nestjs/common';
import { AddRatingProvider } from './add-rating.provider';
import { AddRatingDto } from '../dtos/add-rating.dto';

@Injectable()
export class RatingsService {
  constructor(private readonly addRatingProvider: AddRatingProvider) {}
  async addRating(movieId: string, addRateDto: AddRatingDto) {
    return await this.addRatingProvider.addRating(movieId, addRateDto.rate);
  }
}
