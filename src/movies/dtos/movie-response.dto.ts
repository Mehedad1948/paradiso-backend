import { Expose, Transform } from 'class-transformer';

export class MovieResponseDto {
  @Expose()
  id: string;

  @Expose()
  title: string;

  @Expose()
  releaseDate: Date;

  @Expose()
  imdbRate: number;

  @Expose()
  imdbLink: string;

  @Expose()
  image: string;

  @Expose()
  isWatchedTogether: boolean;

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
