import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MovieDbService } from '../../movies/providers/MovieDb.serviec';
import { MoviesService } from '../../movies/providers/movies.service';
import { Repository } from 'typeorm';
import { Room } from '../room.entity';
import { lockRoom } from './room-transaction';

@Injectable()
export class AddMovieToRoomProvider {
  constructor(
    @Inject(forwardRef(() => MoviesService))
    private readonly movieService: MoviesService,
    private readonly movieDbService: MovieDbService,
    @InjectRepository(Room) private readonly roomRepository: Repository<Room>,
  ) {}
  async addMovieToRoom(roomId: number, dbId: number) {
    let movie = await this.movieService.getMovieWithMovieDbId(dbId);
    if (!movie) {
      const details = await this.movieDbService.getMovieDetails(dbId);
      try {
        movie = await this.movieService.createMovie({
          ...details,
          dbId: details.id,
        });
      } catch (error) {
        // Another room may import the same catalogue movie concurrently.
        if (!(error instanceof ConflictException)) throw error;
        movie = await this.movieService.getMovieWithMovieDbId(dbId);
        if (!movie) throw error;
      }
    }
    const movieId = movie.id;
    return this.roomRepository.manager.transaction(async (manager) => {
      await lockRoom(manager, roomId);
      const exists = await manager
        .getRepository(Room)
        .exists({ where: { id: roomId, movies: { id: movieId } } });
      if (exists) throw new ConflictException('Movie is already in the room');
      await manager
        .createQueryBuilder()
        .relation(Room, 'movies')
        .of(roomId)
        .add(movieId);
      return { message: 'Movie added to room successfully.', movieId };
    });
  }
}
