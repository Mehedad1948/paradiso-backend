import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { queryBoolean } from '../common/validation/query-boolean';

export class ListNotificationsDto {
  @ApiPropertyOptional({
    description: 'nextCursor from the previous page.',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 50,
    default: 20,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;

  @ApiPropertyOptional({ type: Boolean, default: false })
  @IsOptional()
  @Transform(queryBoolean)
  @IsBoolean()
  unreadOnly?: boolean;
}

export const MAX_MARK_READ_IDS = 100;

export class MarkNotificationsReadDto {
  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    maxItems: MAX_MARK_READ_IDS,
    description: 'Notifications to mark read. Send this or all, not both.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MARK_READ_IDS)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids?: string[];

  @ApiPropertyOptional({
    type: 'boolean',
    enum: [true],
    description: 'Mark every unread notification read.',
  })
  @IsOptional()
  @Equals(true)
  all?: true;
}
