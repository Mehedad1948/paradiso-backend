import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';

export class CreateMovieDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsDateString()
  releaseDate?: string; // ISO string (e.g., "2025-05-30")

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  imdbRate?: number;

  @IsOptional()
  @IsUrl()
  imdbLink?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsBoolean()
  isWatchedTogether?: boolean;
}
