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
import { Movie } from '../../movies/movie.entity';
import { CreateCustomMovieDto } from '../../movies/dtos/create-custom-movie.dto';

@Injectable()
export class AddMovieToRoomProvider {
  constructor(
    @Inject(forwardRef(() => MoviesService))
    private readonly movieService: MoviesService,
    private readonly movieDbService: MovieDbService,
    @InjectRepository(Room) private readonly roomRepository: Repository<Room>,
  ) {}
  async addMovieToRoom(roomId: number, dbId: number, isWatchedTogether = false) {
    let movie = await this.movieService.getMovieWithMovieDbId(dbId);
    if (!movie) {
      const details = await this.movieDbService.getMovieDetails(dbId);
      try {
        movie = await this.movieService.createMovie({
          ...details,
          dbId: details.id,
          isWatchedTogether,
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
      // Catalogue movies are shared rows; flag one imported earlier by another room.
      if (isWatchedTogether && !movie.isWatchedTogether) {
        await manager
          .getRepository(Movie)
          .update(movieId, { isWatchedTogether: true });
      }
      await manager
        .createQueryBuilder()
        .relation(Room, 'movies')
        .of(roomId)
        .add(movieId);
      return { message: 'Movie added to room successfully.', movieId };
    });
  }

  // Manual entries are room-owned rows without a TMDb ID, created together
  // with the room link so a rejected duplicate leaves no orphan movie.
  async addCustomMovieToRoom(
    roomId: number,
    userId: number,
    dto: CreateCustomMovieDto,
  ) {
    return this.roomRepository.manager.transaction(async (manager) => {
      await lockRoom(manager, roomId);
      const year = String(dto.year);
      const duplicate = await manager
        .getRepository(Movie)
        .createQueryBuilder('movie')
        .innerJoin('movie.rooms', 'room', 'room.id = :roomId', { roomId })
        .where('LOWER(movie.title) = LOWER(:title)', { title: dto.title })
        .andWhere('LEFT(movie.release_date, 4) = :year', { year })
        .getExists();
      if (duplicate)
        throw new ConflictException('Movie is already in the room');
      const movies = manager.getRepository(Movie);
      const movie = await movies.save(
        movies.create({
          dbId: null,
          title: dto.title,
          release_date: year,
          imdbLink: dto.imdbLink,
          overview: dto.overview,
          isWatchedTogether: dto.isWatchedTogether ?? false,
          addedBy: { id: userId },
          genres: [],
        }),
      );
      await manager
        .createQueryBuilder()
        .relation(Room, 'movies')
        .of(roomId)
        .add(movie.id);
      return {
        message: 'Movie added to room successfully.',
        movieId: movie.id,
      };
    });
  }
}
