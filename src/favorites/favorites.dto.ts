import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export const MAX_FAVORITES = 10;
export const MAX_FAVORITE_NOTE = 280;

// Trims, and turns a blank note into null so it reads as "no note".
const noteValue = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class SetFavoritesDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    maxItems: MAX_FAVORITES,
    description:
      'The full favorites list in display order. Movies left out are removed.',
  })
  @IsArray()
  @ArrayMaxSize(MAX_FAVORITES)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  movieIds: string[];
}

export class UpdateFavoriteNoteDto {
  @ApiProperty({
    type: String,
    nullable: true,
    maxLength: MAX_FAVORITE_NOTE,
    description:
      'Shown with the movie on the profile. null or blank clears it.',
  })
  @Transform(noteValue)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_FAVORITE_NOTE)
  note: string | null;
}
