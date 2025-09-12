import { Expose, Transform } from 'class-transformer';
import { Genre } from 'src/genres/genre.entity';
import { Rating } from 'src/ratings/rating.entity';

export class MovieResponseDto {
  @Expose()
  id: string;

  @Expose()
  title: string;

  @Expose()
  release_date: Date;

  @Expose()
  imdbRate: number;

  @Expose()
  imdbLink: string;

  @Expose()
  image: string;

  @Expose()
  isWatchedTogether: boolean;

  @Expose()
  ratings: Rating[];

  @Expose()
  genres: Genre[];

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
