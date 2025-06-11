import { Injectable } from '@nestjs/common';
import { AddRatingProvider } from './add-rating.provider';
import { AddRatingDto } from '../dtos/add-rating.dto';
import { GetRatingProvider } from './get-rating.provider';
import { GetRatingDto } from '../dtos/get-rating.dto';
import { DeleteRatingProvider } from './delete-rating.provider';
import { GetRoomRatingDto } from '../dtos/get-room-ratings';

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

  async getRoomRating(GetRoomRatingDto: GetRoomRatingDto, roomId: number) {
    return await this.getRatingProvider.getRatingsOfRoom(
      GetRoomRatingDto,
      roomId,
    );
  }

  async deleteRatingWithMovieAndRoom(roomId: number, movieId: string) {
    return await this.deleteRatingProvider.delete(roomId, movieId);
  }
}
