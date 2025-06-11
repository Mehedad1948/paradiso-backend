import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoviesService } from 'src/movies/providers/movies.service';
import { GetRatingDto } from '../dtos/get-rating.dto';
import { Rating } from '../rating.entity';
import { GetRoomRatingDto } from '../dtos/get-room-ratings';
import { Repository } from 'typeorm';
import { PaginationProvider } from 'src/common/pagination/providers/pagination.provider';

@Injectable()
export class GetRatingProvider {
  constructor(
    @InjectRepository(Rating)
    private readonly ratingRepository: Repository<Rating>,
    private readonly movieService: MoviesService,

    private readonly paginationProvider: PaginationProvider,
  ) {}

  async getOne(movieId: string) {
    try {
      const movieWithRatings =
        await this.movieService.getMovieByIdWithRating(movieId);

      if (!movieWithRatings) {
        throw new NotFoundException('No ratings found for this movie');
      }

      return movieWithRatings;
    } catch (error) {
      console.error('❌ Failed to get rating:', error);
      throw new InternalServerErrorException('Failed to retrieve rating');
    }
  }

  async getAllMoviesWithRatings(ratingQuery: GetRatingDto) {
    try {
      const movies =
        await this.movieService.getAllMoviesWithRating(ratingQuery);

      return movies;
    } catch (error) {
      console.error('❌ Failed to get movies with ratings:', error);
      throw new InternalServerErrorException(
        'Failed to fetch movie list with ratings',
      );
    }
  }

  async getRatingsOfRoom(ratingQuery: GetRoomRatingDto, roomId: number) {
    console.log('➡️➡️➡️➡️');

    try {
      const moviesQuery = this.ratingRepository
        .createQueryBuilder('rating')
        .innerJoin('rating.room', 'room', 'room.id = :roomId', { roomId }) // 💥 filter by room
        .innerJoin('rating.user', 'rater') // who rated the movie
        .leftJoinAndSelect('rating.movie', 'movie')
        .leftJoinAndSelect('movie.addedBy', 'user')
        .leftJoinAndSelect('movie.genres', 'genre')
        .select([
          'movie',
          'user.id',
          'user.username',
          'user.avatar',
          'genre.id',
          'genre.name',
          'rater.id',
          'rater.username',
          'rater.avatar',
          'rating.rate',
          'rating.id',
        ])
        .orderBy('movie.createdAt', 'DESC');

      const paginatedRatings = await this.paginationProvider.paginateQuery(
        {
          limit: ratingQuery.limit,
          page: ratingQuery.page,
        },
        moviesQuery,
      );

      return paginatedRatings;
    } catch (error) {
      console.error('❌ Failed to get movies with ratings:', error);
      throw new InternalServerErrorException(
        'Failed to fetch movie list with ratings',
      );
    }
  }
}
