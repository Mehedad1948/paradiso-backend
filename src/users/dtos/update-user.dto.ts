import { ApiPropertyOptional } from '@nestjs/swagger';
// create-user.dto.ts
import {
  ArrayMaxSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsString,
  IsUUID,
  MinLength,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { AVATAR_URL_MAX_LENGTH } from '../avatar-url';

export const MAX_FAVORITE_GENRES = 10;

export class UpdateUserDto {
  // @IsEmail()
  // email?: string;

  @ApiPropertyOptional({ type: String, minLength: 6, writeOnly: true })
  @IsString()
  @MinLength(6)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  password?: string;

  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 100 })
  @IsString()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @MinLength(1)
  @MaxLength(100)
  username?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uri',
    maxLength: AVATAR_URL_MAX_LENGTH,
    nullable: true,
    description:
      'HTTPS URL returned by POST /uploads/file with folder=avatars. null removes the avatar; omit to leave it unchanged.',
  })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @MaxLength(AVATAR_URL_MAX_LENGTH)
  avatar?: string | null;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    maxItems: MAX_FAVORITE_GENRES,
    uniqueItems: true,
    description:
      'Genre IDs from GET /genres. Replaces the whole favorite set; [] clears it; omit to leave it unchanged.',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(MAX_FAVORITE_GENRES)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  genreIds?: string[];

  @ApiPropertyOptional({
    type: 'boolean',
    example: true,
    description:
      'Send true to mark onboarding finished or skipped. Idempotent; it cannot be unset.',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Equals(true, { message: 'onboarded can only be set to true' })
  onboarded?: true;
}
