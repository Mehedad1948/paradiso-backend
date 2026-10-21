import { ApiProperty } from '@nestjs/swagger';
// add-rating.dto.ts
import { IsNumber, IsUUID, Max, Min } from 'class-validator';

export class AddRatingDto {
  @ApiProperty({ type: Number, minimum: 1, maximum: 10, multipleOf: 0.1 })
  @IsNumber({ maxDecimalPlaces: 1, allowNaN: false, allowInfinity: false })
  @Min(1)
  @Max(10)
  rate: number;

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  movieId: string;
}
