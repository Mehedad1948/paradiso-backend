import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Accept a bare IMDb ID ("tt0133093") as well as a full title URL.
const imdbLink = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  return /^tt\d{5,10}$/i.test(trimmed)
    ? 'https://www.imdb.com/title/' + trimmed.toLowerCase() + '/'
    : trimmed;
};

// A movie a user enters by hand when it is missing from TMDb.
export class CreateCustomMovieDto {
  @ApiProperty({ type: String, maxLength: 255, minLength: 1 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({
    type: 'integer',
    format: 'int32',
    minimum: 1870,
    maximum: 2100,
  })
  @IsInt()
  @Min(1870)
  @Max(2100)
  year: number;

  @ApiPropertyOptional({
    type: String,
    format: 'uri',
    nullable: true,
    description:
      'IMDb title URL or bare IMDb ID (e.g. tt0133093), normalised to a URL.',
  })
  @IsOptional()
  @Transform(imdbLink)
  @IsUrl({
    protocols: ['https', 'http'],
    require_protocol: true,
    host_whitelist: ['imdb.com', 'www.imdb.com', 'm.imdb.com'],
  })
  @MaxLength(255)
  imdbLink?: string;

  @ApiPropertyOptional({ type: String, maxLength: 2000, nullable: true })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  overview?: string;
}
