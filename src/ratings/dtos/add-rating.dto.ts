import { ApiProperty } from '@nestjs/swagger';
// add-rating.dto.ts
import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class AddRatingDto {
  @ApiProperty({ type: 'integer', format: 'int32', minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  rate: number;

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  movieId: string;
}
