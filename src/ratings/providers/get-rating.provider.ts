import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginationProvider } from 'src/common/pagination/providers/pagination.provider';
import { MoviesService } from 'src/movies/providers/movies.service';
import { Repository } from 'typeorm';
import { GetRatingDto } from '../dtos/get-rating.dto';
import { Rating } from '../rating.entity';

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
}
