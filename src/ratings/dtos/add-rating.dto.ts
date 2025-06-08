// add-rating.dto.ts
import { IsInt, Max, Min } from 'class-validator';

export class AddRatingDto {
  @IsInt()
  @Min(1)
  @Max(10)
  rate: number;

  @IsInt()
  roomId: number;
}
