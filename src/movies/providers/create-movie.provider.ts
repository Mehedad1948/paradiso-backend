import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { REQUEST_USER_KEY } from 'src/auth/constants/auth.constants';
import { Repository } from 'typeorm';
import { CreateMovieDto } from '../dtos/create-movie.dto';
import { Movie } from '../movie.entity';
import { GenresService } from 'src/genres/providers/genres.service';
import { Genre } from 'src/genres/genre.entity';

@Injectable()
export class CreateMovieProvider {
  constructor(
    @Inject(REQUEST) private readonly request: Request,
    @InjectRepository(Movie)
    private readonly movieRepository: Repository<Movie>,
    private readonly genresService: GenresService,
  ) {}

  async createMovie(createMovieDto: CreateMovieDto): Promise<Movie> {
    try {
      const userPayload = this.request[REQUEST_USER_KEY];

      console.log('🚀🚀🚀', createMovieDto);

      const existingMovie = await this.movieRepository.findOne({
        where: {
          dbId: createMovieDto.dbId,
        },
      });

      if (existingMovie) {
        throw new ConflictException('Movie already exists');
      }

      let genres: Genre[] = [];
      const genreIds = createMovieDto.genres?.map((genre) => genre.id);
      if (genreIds) {
        genres = await this.genresService.findGenresWithTmdbIds(genreIds);
      }

      const movie = this.movieRepository.create({
        ...createMovieDto,
        addedBy: { id: userPayload.sub },
        genres,
      });

      console.log('saving movie', movie);

      const savedMovie = await this.movieRepository.save(movie);
      return savedMovie;
    } catch (error) {
      console.log('❌❌❌➡️', error);

      if (error instanceof ConflictException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to create movie');
    }
  }
}
