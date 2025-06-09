import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { REQUEST_USER_KEY } from 'src/auth/constants/auth.constants';
import { MovieDbService } from 'src/movies/providers/MovieDb.serviec';
import { MoviesService } from 'src/movies/providers/movies.service';
import { Repository } from 'typeorm';
import { Room } from '../room.entity';
import { CreateMovieDto } from 'src/movies/dtos/create-movie.dto';

@Injectable()
export class AddMovieToRoomProvider {
  constructor(
    @Inject(REQUEST) private readonly request: Request,

    private readonly movieService: MoviesService,
    private readonly movieDbService: MovieDbService,

    @InjectRepository(Room)
    private readonly roomRepository: Repository<Room>,
  ) {}

  async addMovieToRoom(roomId: number, dbId: number) {
    const userPayload = this.request[REQUEST_USER_KEY];
    const userId = userPayload?.sub;

    if (!userId) {
      throw new UnauthorizedException('User not authenticated.');
    }

    const room = await this.roomRepository.findOne({
      where: { id: roomId },
      relations: ['users', 'movies'],
    });

    if (!room) {
      throw new NotFoundException('Room was not found.');
    }

    const isMemberOfRoom = room.users.some((user) => user.id === userId);
    if (!isMemberOfRoom) {
      throw new UnauthorizedException('User is not a member of the room.');
    }

    let movie = await this.movieService.getMovieWithMovieDbId(dbId);

    if (!movie) {
      const dbMovie = await this.movieDbService.getMovieDetails(dbId);
      if (!dbMovie) {
        throw new NotFoundException(
          'Movie with the provided TMDb ID was not found.',
        );
      }

      const createMovieDto: CreateMovieDto = {
        dbId: dbMovie.id,
        title: dbMovie.title,
        overview: dbMovie.overview,
        releaseDate: dbMovie.release_date,
        poster_path: dbMovie.poster_path,
        backdrop_path: dbMovie.backdrop_path,
        adult: dbMovie.adult,
        popularity: dbMovie.popularity,
        vote_average: dbMovie.vote_average,
        vote_count: dbMovie.vote_count,
        genre_ids: dbMovie.genre_ids,
        imdbRate: undefined,
        imdbLink: undefined,
        isWatchedTogether: false,
      };

      movie = await this.movieService.createMovie(createMovieDto);
    }

    const isMovieAlreadyInRoom = room.movies.some(
      (roomMovie) => roomMovie.dbId === movie.dbId,
    );
    if (isMovieAlreadyInRoom) {
      return { message: `Movie "${movie.title}" is already in the room.` };
    }

    room.movies.push(movie);
    await this.roomRepository.save(room);

    return { message: `Movie "${movie.title}" added to room successfully.` };
  }
}
