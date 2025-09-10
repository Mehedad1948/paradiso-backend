import {
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginationProvider } from 'src/common/pagination/providers/pagination.provider';
import { MoviesService } from 'src/movies/providers/movies.service';
import { In, Repository } from 'typeorm';
import { GetRatingDto } from '../dtos/get-rating.dto';
import { Rating } from '../rating.entity';
import { Room } from 'src/rooms/room.entity';

@Injectable()
export class GetRatingProvider {
  constructor(
    @InjectRepository(Rating)
    private readonly ratingRepository: Repository<Rating>,

    @Inject(forwardRef(() => MoviesService))
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

  async getRatingsOfRoomWithMovies(roomId: number, movieIds: string[]) {
    const ratings = await this.ratingRepository.find({
      where: {
        room: { id: roomId } as Room,
        movie: { id: In(movieIds) },
      },
      relations: ['user', 'movie'],
    });
    return ratings;
  }
}
