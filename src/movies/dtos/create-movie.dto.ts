import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  IsInt,
  ValidateNested,
  ArrayMaxSize,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class MovieGenreDto {
  @ApiProperty({ type: 'integer', format: 'int32', minimum: 1 })
  @IsInt()
  @Min(1)
  id: number;

  @ApiPropertyOptional({ type: String, maxLength: 255, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;
}

export class CreateMovieDto {
  @ApiProperty({ type: String, maxLength: 255, minLength: 1 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  title: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  original_title?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  release_date?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  video?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  overview: string;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsNumber()
  popularity: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  original_language?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  poster_path?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  backdrop_path?: string;

  @ApiPropertyOptional({ type: Boolean, nullable: true })
  @IsOptional()
  @IsBoolean()
  adult?: boolean;

  @ApiPropertyOptional({
    type: Number,
    minimum: 0,
    maximum: 10,
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  vote_average?: number;

  @ApiPropertyOptional({ type: Number, minimum: 0, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  vote_count?: number;

  @ApiPropertyOptional({
    type: () => MovieGenreDto,
    isArray: true,
    maxItems: 100,
    nullable: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => MovieGenreDto)
  genres?: MovieGenreDto[];

  @ApiPropertyOptional({
    type: Number,
    minimum: 0,
    maximum: 10,
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  imdbRate?: number;

  @ApiPropertyOptional({ type: String, format: 'uri', nullable: true })
  @IsOptional()
  @IsUrl()
  imdbLink?: string;

  @ApiProperty({ type: 'integer', format: 'int32', minimum: 1 })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  dbId: number;

  @ApiPropertyOptional({ type: Boolean, nullable: true })
  @IsOptional()
  @IsBoolean()
  isWatchedTogether?: boolean;
}
