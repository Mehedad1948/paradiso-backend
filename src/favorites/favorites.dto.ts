import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export const MAX_FAVORITES = 10;

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
