import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsString,
  IsUUID,
  IsUrl,
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

export class CommunityPageDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
  @ApiPropertyOptional({
    minimum: 1,
    description: 'Return IDs older than this cursor.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  before?: number;
}

export class CommunitySuggestedUsersDto {
  @ApiPropertyOptional({ default: 8, minimum: 1, maximum: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 8;
}

export class CommunityFeedDto extends CommunityPageDto {
  @ApiPropertyOptional({ minimum: 1 })
  @ValidateIf((_, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  authorId?: number;
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_, value) => value !== undefined)
  @IsUUID()
  movieId?: string;
}

export class CreateCommunityPostDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Movie the post is about. Optional: posts can be general or about an unreleased film.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsUUID()
  movieId?: string;
  @ApiProperty({ minLength: 1, maxLength: 4000 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text: string;
  @ApiPropertyOptional({
    minimum: 0,
    maximum: 10,
    description: 'Optional personal rating out of 10. Requires movieId.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(10)
  rating?: number;
  @ApiPropertyOptional({
    maxLength: 2048,
    description:
      'HTTPS image URL from /uploads/file; defaults to movie poster.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  imageUrl?: string;
  @ApiPropertyOptional({
    minimum: 1,
    description:
      'Quote another post: your text is shown with the original embedded.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(1)
  quotedPostId?: number;
  @ApiPropertyOptional({
    minimum: 1,
    description: 'Scope the post to a room. Requires membership.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(1)
  roomId?: number;
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Active invite link owned by your room to promote with this post.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsUUID()
  promotedInviteToken?: string;
}

export class UpdateCommunityPostDto extends PartialType(
  PickType(CreateCommunityPostDto, ['text', 'rating', 'imageUrl'] as const),
  { skipNullProperties: false },
) {}

export class CommunityCommentDto {
  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text: string;
}

export class CommunityReactionDto {
  @ApiProperty({ enum: [1, -1], description: '1 = like, -1 = dislike.' })
  @IsIn([1, -1])
  value: 1 | -1;
}
