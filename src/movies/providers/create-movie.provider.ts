import { AuthenticatedRequest } from '../../auth/interfaces/authenticated-request.interface';
import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { REQUEST_USER_KEY } from '../../auth/constants/auth.constants';
import { QueryFailedError, Repository } from 'typeorm';
import { CreateMovieDto } from '../dtos/create-movie.dto';
import { Movie } from '../movie.entity';
import { GenresService } from '../../genres/providers/genres.service';

@Injectable()
export class CreateMovieProvider {
  constructor(
    @Inject(REQUEST) private readonly request: AuthenticatedRequest,
    @InjectRepository(Movie)
    private readonly movieRepository: Repository<Movie>,
    private readonly genresService: GenresService,
  ) {}
  async createMovie(dto: CreateMovieDto): Promise<Movie> {
    const userId = this.request[REQUEST_USER_KEY]?.sub;
    if (!userId) throw new UnauthorizedException();
    const genres = dto.genres?.length
      ? await this.genresService.findGenresWithTmdbIds(
          dto.genres.map((g) => g.id),
        )
      : [];
    // Map persisted columns explicitly; never accept arbitrary relations from a caller.
    const movie = this.movieRepository.create({
      dbId: dto.dbId,
      title: dto.title,
      original_title: dto.original_title,
      overview: dto.overview,
      release_date: dto.release_date,
      video: dto.video,
      poster_path: dto.poster_path,
      vote_average: dto.vote_average,
      imdbRate: dto.imdbRate,
      imdbLink: dto.imdbLink,
      isWatchedTogether: dto.isWatchedTogether ?? false,
      addedBy: { id: userId },
      genres,
    });
    try {
      return await this.movieRepository.save(movie);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        error.driverError.code === '23505'
      ) {
        throw new ConflictException('Movie already exists');
      }
      throw error;
    }
  }
}
