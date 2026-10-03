import { Expose } from 'class-transformer';

export class GenreResponseDto {
  @Expose()
  id: string;

  @Expose()
  tmdbId: number;

  @Expose()
  name: string;
}
