import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoviesService } from 'src/movies/providers/movies.service';
import { RatingsService } from 'src/ratings/providers/ratings.service';
import { Repository } from 'typeorm';
import { Room } from '../room.entity';

@Injectable()
export class DeleteMovieFromRoomProvider {
  constructor(
    private readonly movieService: MoviesService,

    @Inject(forwardRef(() => RatingsService))
    private readonly ratingsService: RatingsService,

    @InjectRepository(Room)
    private readonly roomRepository: Repository<Room>,
  ) {}

  async delete(roomId: number, movieId: string) {
    const room = await this.roomRepository.findOne({
      where: { id: roomId },
      relations: ['movies'],
    });

    if (!room) {
      throw new NotFoundException('Room was not found.');
    }

    const movie = await this.movieService.getMovieById(movieId);
    if (!movie) {
      throw new NotFoundException('Movie was not found.');
    }

    const isMovieInRoom = room.movies.some(
      (roomMovie) => roomMovie.id === movieId,
    );
    if (!isMovieInRoom) {
      throw new ConflictException('Movie is not in the room.');
    }

    await this.ratingsService.deleteRatingWithMovieAndRoom(roomId, movieId);

    room.movies = room.movies.filter((roomMovie) => roomMovie.id !== movieId);
    await this.roomRepository.save(room);

    return {
      message: `Movie "${movie.title}" removed from room successfully.`,
    };
  }
}
