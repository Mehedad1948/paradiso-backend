import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
  PartialType,
  PickType,
} from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class MovieCommentPageDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
  @ApiPropertyOptional({
    minimum: 1,
    description: 'Return comments older than this cursor (a comment ID).',
  })
  @ValidateIf((_, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  before?: number;
}

export class MovieCommentRepliesPageDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
  @ApiPropertyOptional({
    minimum: 1,
    description: 'Return replies newer than this cursor (a reply ID).',
  })
  @ValidateIf((_, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  after?: number;
}

export class CreateMovieCommentDto {
  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text: string;
  @ApiPropertyOptional({
    default: false,
    description: 'Marks the comment as revealing the plot.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  spoiler?: boolean;
  @ApiPropertyOptional({
    minimum: 1,
    description:
      'Reply to this comment on the same movie. Replying to a reply joins the same thread.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(1)
  parentId?: number;
}

// A comment cannot move to another thread once posted.
export class UpdateMovieCommentDto extends PartialType(
  PickType(CreateMovieCommentDto, ['text', 'spoiler'] as const),
) {}
