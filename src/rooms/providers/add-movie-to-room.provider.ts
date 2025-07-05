import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { CreateMovieDto } from 'src/movies/dtos/create-movie.dto';
import { MovieDbService } from 'src/movies/providers/MovieDb.serviec';
import { MoviesService } from 'src/movies/providers/movies.service';
import { Repository } from 'typeorm';
import { Room } from '../room.entity';

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
    console.log(`Adding movie with DB ID ${dbId} to room with ID ${roomId}`);

    const room = await this.roomRepository.findOne({
      where: { id: roomId },
      relations: ['movies'],
    });

    if (!room) {
      throw new NotFoundException('Room was not found.');
    }

    let movie;

    movie = await this.movieService.getMovieWithMovieDbId(dbId);

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
        genres: dbMovie.genres,
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
      throw new ConflictException(`Movie "${movie.title}" is already existed`);
    }

    room.movies.push(movie);
    await this.roomRepository.save(room);

    return { message: `Movie "${movie.title}" added to room successfully.` };
  }
}
