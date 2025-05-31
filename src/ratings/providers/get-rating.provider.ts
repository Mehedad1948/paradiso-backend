import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rating } from '../rating.entity';
import { MoviesService } from 'src/movies/providers/movies.service';

@Injectable()
export class GetRatingProvider {
  constructor(
    @InjectRepository(Rating)
    private readonly ratingRepository: Repository<Rating>,

    private readonly movieService: MoviesService,
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

  async getAllMoviesWithRatings() {
    try {
      const movies = await this.movieService.getAllMoviesWithRating();
      if (!movies.length) {
        throw new NotFoundException('No movies found');
      }

      return movies;
    } catch (error) {
      console.error('❌ Failed to get movies with ratings:', error);
      throw new InternalServerErrorException(
        'Failed to fetch movie list with ratings',
      );
    }
  }
}
