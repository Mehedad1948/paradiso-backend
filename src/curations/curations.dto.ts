import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  EDITORS_PICKS_MAX,
  IMAGE_URL_PATTERN,
  LANDING_GRID_SLOTS,
  MAX_IMAGE_URL,
  MAX_OBJECT_POSITION,
  TMDB_IMAGE_URL_PATTERN,
} from './curations.constants';

// Trims text, and turns blank into null so it reads as "not set".
const optionalText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

// UUIDs compare case-insensitively in the database, so they must here too.
const lowerCaseIds = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((id: unknown) =>
        typeof id === 'string' ? id.toLowerCase() : id,
      )
    : value;

export class LandingGridItemRequest {
  @ApiProperty({
    type: 'integer',
    minimum: 0,
    maximum: LANDING_GRID_SLOTS - 1,
    description:
      'Grid cell index, row-major in the frontend grid. Unique within the request. Outside 0–26 is rejected with 400.',
  })
  @IsInt()
  @Min(0)
  @Max(LANDING_GRID_SLOTS - 1)
  slot: number;

  @ApiProperty({
    type: String,
    format: 'uuid',
    description:
      'Library movie id (Movie.id, not the TMDb id). The same movie may fill several slots. An id that is not in the library is rejected with 422.',
  })
  @IsUUID('all')
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  movieId: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: MAX_IMAGE_URL,
    pattern: IMAGE_URL_PATTERN.source,
    description:
      'Hand-graded image for this cell: an absolute https:// URL (for example from POST /uploads/file) or a site-relative path starting with /. Omitted, null or blank: the frontend falls back to the movie poster. Anything else is rejected with 400.',
  })
  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(MAX_IMAGE_URL)
  @Matches(IMAGE_URL_PATTERN, {
    message:
      'imageUrl must be an absolute https:// URL or a path starting with /',
  })
  imageUrl?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: MAX_OBJECT_POSITION,
    example: 'center 35%',
    description:
      'CSS object-position for the image, such as "center 35%". Omitted, null or blank: the frontend default. Longer than 40 characters is rejected with 400.',
  })
  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(MAX_OBJECT_POSITION)
  objectPosition?: string | null;
}

export class ReplaceLandingGridRequest {
  @ApiProperty({
    type: [LandingGridItemRequest],
    maxItems: LANDING_GRID_SLOTS,
    description:
      'The whole grid. Slots left out become empty; an empty array clears the grid. Replaces the stored list in one transaction.',
  })
  @IsArray()
  @ArrayMaxSize(LANDING_GRID_SLOTS)
  @ValidateNested({ each: true })
  @Type(() => LandingGridItemRequest)
  items: LandingGridItemRequest[];
}

export class EditorsPickItemRequest {
  @ApiProperty({
    type: String,
    format: 'uuid',
    description:
      'Library movie id (Movie.id, not the TMDb id). Each movie can be a pick once.',
  })
  @IsUUID('all')
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  movieId: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: MAX_IMAGE_URL,
    pattern: TMDB_IMAGE_URL_PATTERN.source,
    example: 'https://image.tmdb.org/t/p/w500/abc123.jpg',
    description:
      'Cover shown for this pick instead of the movie poster: a TMDb image URL, as offered by GET /admin/curations/movies/{movieId}/posters. Omitted, null or blank: the movie poster. Any other URL is rejected with 400.',
  })
  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(MAX_IMAGE_URL)
  @Matches(TMDB_IMAGE_URL_PATTERN, {
    message: 'imageUrl must be a https://image.tmdb.org/t/p/ image URL',
  })
  imageUrl?: string | null;
}

export class ReplaceEditorsPicksRequest {
  @ApiPropertyOptional({
    type: [EditorsPickItemRequest],
    maxItems: EDITORS_PICKS_MAX,
    description:
      'The whole pool in display order, each pick with an optional cover image. No repeated movie (400); more than 40 is rejected with 400; an unknown movie with 422; a movie with neither a poster nor an imageUrl with 422. An empty array clears the pool. Replaces the stored list in one transaction. Send this or movieIds, not both (400).',
  })
  @ValidateIf((body: ReplaceEditorsPicksRequest) => body.movieIds === undefined)
  @IsArray()
  @ArrayMaxSize(EDITORS_PICKS_MAX)
  @ValidateNested({ each: true })
  @Type(() => EditorsPickItemRequest)
  items?: EditorsPickItemRequest[];

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    maxItems: EDITORS_PICKS_MAX,
    uniqueItems: true,
    deprecated: true,
    description:
      'Deprecated, use items. The whole pool of library movie ids (Movie.id) in display order, every pick on its movie poster: saving this clears any cover images. Same rules as items.',
  })
  @ValidateIf((body: ReplaceEditorsPicksRequest) => body.items === undefined)
  @IsArray()
  @ArrayMaxSize(EDITORS_PICKS_MAX)
  @Transform(lowerCaseIds)
  @IsUUID('all', { each: true })
  movieIds?: string[];
}
