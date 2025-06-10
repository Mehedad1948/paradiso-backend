// add-rating.dto.ts
import { IsInt, IsString, Max, Min } from 'class-validator';

export class AddRatingDto {
  @IsInt()
  @Min(1)
  @Max(10)
  rate: number;

  @IsString()
  movieId: string;
}
