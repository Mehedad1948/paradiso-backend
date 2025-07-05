import { Injectable } from '@nestjs/common';
import { AddRatingDto } from '../dtos/add-rating.dto';
import { GetRatingDto } from '../dtos/get-rating.dto';
import { AddRatingProvider } from './add-rating.provider';
import { DeleteRatingProvider } from './delete-rating.provider';
import { GetRatingProvider } from './get-rating.provider';

@Injectable()
export class RatingsService {
  constructor(
    private readonly addRatingProvider: AddRatingProvider,

    private readonly getRatingProvider: GetRatingProvider,

    private readonly deleteRatingProvider: DeleteRatingProvider,
  ) {}
  async addRating(roomId: number, addRateDto: AddRatingDto) {
    return await this.addRatingProvider.addRating(roomId, addRateDto);
  }

  async getAllRating(ratingQuery: GetRatingDto) {
    return await this.getRatingProvider.getAllMoviesWithRatings(ratingQuery);
  }

  async getOneRating(movieId: string) {
    return await this.getRatingProvider.getOne(movieId);
  }

  async deleteRatingWithMovieAndRoom(roomId: number, movieId: string) {
    return await this.deleteRatingProvider.delete(roomId, movieId);
  }
}
