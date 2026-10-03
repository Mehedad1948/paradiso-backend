import { Expose, Transform, Type } from 'class-transformer';
import { GenreResponseDto } from '../../genres/dtos/genre-response.dto';
import { Rating } from '../../ratings/rating.entity';

export class MovieResponseDto {
  @Expose()
  id: string;

  @Expose()
  dbId: number;

  @Expose()
  title: string;

  @Expose()
  release_date: string;

  @Expose()
  imdbRate: number;

  @Expose()
  imdbLink: string;

  @Expose()
  poster_path: string;

  @Expose()
  overview: string;

  @Expose()
  isWatchedTogether: boolean;

  @Expose()
  ratings: Rating[];

  @Expose()
  @Type(() => GenreResponseDto)
  genres: GenreResponseDto[];

  @Expose()
  @Transform(({ obj }) => ({
    avatar: obj.addedBy?.avatar || null,
    username: obj.addedBy?.username || null,
  }))
  addedBy: {
    avatar: string;
    username: string;
  };

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}
