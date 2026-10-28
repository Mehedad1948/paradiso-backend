import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class ResolveMovieDto {
  @ApiProperty({ type: 'integer', format: 'int32', minimum: 1 })
  @IsInt()
  @Min(1)
  tmdbId: number;
}
