import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateGenreDto {
  @ApiProperty({ type: String, minLength: 1 })
  @IsString()
  @MinLength(1)
  name: string;
  @ApiPropertyOptional({
    type: 'integer',
    format: 'int32',
    minimum: 1,
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  tmdbId?: number; // optional if syncing from TMDb
}
