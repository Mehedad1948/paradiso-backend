import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoviesService } from 'src/movies/providers/movies.service';
import { RoomsService } from 'src/rooms/providers/rooms.service';
import { Repository } from 'typeorm';
import { Rating } from '../rating.entity';

@Injectable()
export class DeleteRatingProvider {
  constructor(
    @InjectRepository(Rating)
    private readonly ratingRepository: Repository<Rating>,

    @Inject(forwardRef(() => MoviesService))
    private readonly movieService: MoviesService,

    @Inject(forwardRef(() => RoomsService))
    private readonly roomService: RoomsService,
  ) {}

  async delete(roomId: number, movieId: string) {
    const room = await this.roomService.findRoomById(roomId);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const movie = await this.movieService.getMovieById(movieId);
    if (!movie) {
      throw new NotFoundException('Movie not found');
    }

    const movieInRoom = room.movies.some((m) => m.id === movie.id);
    if (!movieInRoom) {
      throw new ConflictException('Movie is not in the room');
    }

    await this.ratingRepository.delete({
      movie: { id: movie.id },
      room: { id: room.id },
    });

    return { message: 'Ratings deleted successfully' };
  }
}
