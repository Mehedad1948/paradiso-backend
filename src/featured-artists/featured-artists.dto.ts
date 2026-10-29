import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../common/pagination/dtos/pagination-query.dto';
import { queryBoolean } from '../common/validation/query-boolean';

export const MAX_TAGLINE = 140;
export const MAX_NOTE = 500;
export const MAX_BOOST = 10;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ListFeaturedArtistsDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 11,
    default: 11,
    description:
      'How many days to return: today first, then the days before it.',
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(11)
  limit: number = 11;
}

export class AdminFeaturedRangeDto {
  @ApiPropertyOptional({
    type: String,
    format: 'date',
    description: 'First UTC day. Default: 30 days before today.',
  })
  @IsOptional()
  @Matches(DATE)
  from?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    description:
      'Last UTC day. Default: 30 days after today. At most 120 days after from.',
  })
  @IsOptional()
  @Matches(DATE)
  to?: string;
}

export class SetFeaturedArtistRequest {
  @ApiProperty({ type: 'integer', minimum: 1, description: 'TMDb person ID.' })
  @IsInt()
  @Min(1)
  tmdbPersonId: number;

  @ApiPropertyOptional({
    type: String,
    maxLength: MAX_TAGLINE,
    description:
      'Editorial line shown with the artist. Longer than 140 characters is rejected with 422.',
  })
  @IsOptional()
  @IsString()
  tagline?: string;
}

export class UpsertFeaturedCandidateRequest {
  @ApiPropertyOptional({
    type: Number,
    minimum: 0,
    maximum: MAX_BOOST,
    description:
      'Multiplies the person’s chance of being picked: 0 never, 1 normal. Outside 0–10 is rejected with 422.',
  })
  @IsOptional()
  @IsNumber()
  boost?: number;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Never auto-picked. Manual scheduling still works.',
  })
  @IsOptional()
  @IsBoolean()
  blocked?: boolean;

  @ApiPropertyOptional({
    type: String,
    maxLength: MAX_NOTE,
    description:
      'Why. An empty string clears it. Longer than 500 characters is rejected with 422.',
  })
  @IsOptional()
  @IsString()
  note?: string;
}

export class ListFeaturedCandidatesDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    type: Boolean,
    description: 'true: boost above 1. false: boost of 1 or less.',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(queryBoolean)
  boosted?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  @Transform(queryBoolean)
  blocked?: boolean;
}

export class SearchFeaturedPeopleDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  query: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 500,
    default: 1,
    description: 'TMDb pages hold 20 people and stop at 500.',
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  page: number = 1;
}
