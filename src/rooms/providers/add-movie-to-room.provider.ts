import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MovieDbService } from '../../movies/providers/MovieDb.serviec';
import { MoviesService } from '../../movies/providers/movies.service';
import { EntityManager, Repository } from 'typeorm';
import { Room } from '../room.entity';
import { lockRoom } from './room-transaction';
import { Movie } from '../../movies/movie.entity';
import { toMovieExtras } from '../../movies/tmdb-extras';
import { CreateCustomMovieDto } from '../../movies/dtos/create-custom-movie.dto';
import { NotificationsService } from '../../notifications/notifications.service';

@Injectable()
export class AddMovieToRoomProvider {
  constructor(
    @Inject(forwardRef(() => MoviesService))
    private readonly movieService: MoviesService,
    private readonly movieDbService: MovieDbService,
    @InjectRepository(Room) private readonly roomRepository: Repository<Room>,
    private readonly notifications: NotificationsService,
  ) {}

  // Every member and the owner hears about a new movie, except whoever added it.
  private async notifyMovieAdded(
    manager: EntityManager,
    roomId: number,
    actorId: number,
    movie: Pick<Movie, 'id' | 'title' | 'poster_path'>,
  ) {
    const room = await manager
      .getRepository(Room)
      .createQueryBuilder('room')
      .leftJoin('room.users', 'member')
      .leftJoin('room.owner', 'owner')
      .select(['room.id', 'room.name', 'room.image', 'member.id', 'owner.id'])
      .where('room.id = :roomId', { roomId })
      .getOneOrFail();
    const recipients = new Set(room.users.map((user) => user.id));
    if (room.owner) recipients.add(room.owner.id);
    await this.notifications.notify(
      [...recipients].map((recipientId) => ({
        type: 'movie_added' as const,
        recipientId,
        actorId,
        entityType: 'movie' as const,
        entityId: movie.id,
        roomId,
        data: {
          roomName: room.name,
          roomImage: room.image ?? null,
          movieTitle: movie.title,
          posterUrl: movie.poster_path ?? null,
        },
      })),
      manager,
    );
  }

  async addMovieToRoom(
    roomId: number,
    userId: number,
    dbId: number,
    isWatchedTogether = false,
  ) {
    let movie = await this.movieService.getMovieWithMovieDbId(dbId);
    if (!movie) {
      // The same request stores the details screen's data, so it never
      // has to call the catalogue for this movie again.
      const details = await this.movieDbService.getMovieDetailsWithExtras(dbId);
      try {
        movie = await this.movieService.createMovie(
          { ...details, dbId: details.id, isWatchedTogether },
          toMovieExtras(details),
        );
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
      await this.notifyMovieAdded(manager, roomId, userId, movie);
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
      await this.notifyMovieAdded(manager, roomId, userId, movie);
      return {
        message: 'Movie added to room successfully.',
        movieId: movie.id,
      };
    });
  }
}
