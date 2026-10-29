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
  ValidateNested,
} from 'class-validator';
import {
  EDITORS_PICKS_MAX,
  IMAGE_URL_PATTERN,
  LANDING_GRID_SLOTS,
  MAX_IMAGE_URL,
  MAX_OBJECT_POSITION,
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

export class ReplaceEditorsPicksRequest {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    maxItems: EDITORS_PICKS_MAX,
    uniqueItems: true,
    description:
      'The whole pool of library movie ids (Movie.id) in display order. No duplicates (400); more than 40 is rejected with 400; an unknown id with 422; a movie without a poster with 422. An empty array clears the pool. Replaces the stored list in one transaction.',
  })
  @IsArray()
  @ArrayMaxSize(EDITORS_PICKS_MAX)
  @Transform(lowerCaseIds)
  @IsUUID('all', { each: true })
  movieIds: string[];
}
