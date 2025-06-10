import {
  IsArray,
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

  @IsString()
  @IsOptional()
  original_title?: string;

  @IsString()
  @IsOptional()
  release_date?: string;

  @IsString()
  @IsOptional()
  video?: string;

  @IsString()
  @IsOptional()
  overview: string;

  @IsOptional()
  @IsNumber()
  popularity: number;

  @IsString()
  @IsOptional()
  original_language?: string;

  @IsOptional()
  @IsDateString()
  releaseDate?: string;

  @IsOptional()
  @IsString()
  poster_path?: string;

  @IsOptional()
  @IsString()
  backdrop_path?: string;

  @IsOptional()
  @IsBoolean()
  adult?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  vote_average?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  vote_count?: number;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  @Min(0, { each: true })
  genre_ids?: number[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  imdbRate?: number;

  @IsOptional()
  @IsUrl()
  imdbLink?: string;

  @IsNotEmpty()
  dbId: number;

  @IsOptional()
  @IsBoolean()
  isWatchedTogether?: boolean;
}
