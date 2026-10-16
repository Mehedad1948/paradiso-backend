import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDate,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const present = (_: unknown, value: unknown) => value !== undefined;

// One emoji, including skin tones, flags and ZWJ sequences; no plain text.
export const EMOJI_PATTERN =
  /^(?=.*[\p{Extended_Pictographic}\p{Regional_Indicator}])[\p{Extended_Pictographic}\p{Emoji_Component}]+$/u;

export class ChatPageDto {
  @ApiPropertyOptional({
    type: 'integer',
    default: 30,
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 30;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    description: 'Return messages older than this message ID.',
  })
  @ValidateIf(present)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  before?: number;
}

export class ChatSyncDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
    description:
      'The cursor from the previous sync response, or the time the first page was loaded.',
  })
  @Type(() => Date)
  @IsDate()
  since: Date;

  @ApiPropertyOptional({
    type: 'integer',
    default: 100,
    minimum: 1,
    maximum: 200,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 100;
}

export class ChatMovieMentionDto {
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'A movie already in this room. Send this or tmdbId.',
  })
  @ValidateIf(present)
  @IsUUID()
  movieId?: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    description: 'A TMDb movie ID from /movies/tmdb/search.',
  })
  @ValidateIf(present)
  @IsInt()
  @Min(1)
  tmdbId?: number;
}

export class ChatPollOptionDto {
  @ApiPropertyOptional({
    type: String,
    minLength: 1,
    maxLength: 100,
    description: 'Defaults to the movie title when movieId is set.',
  })
  @ValidateIf(present)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  text?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'A movie in this room, for "what do we watch" polls.',
  })
  @ValidateIf(present)
  @IsUUID()
  movieId?: string;
}

export class ChatPollDto {
  @ApiProperty({
    type: () => ChatPollOptionDto,
    isArray: true,
    minItems: 2,
    maxItems: 10,
  })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ChatPollOptionDto)
  options: ChatPollOptionDto[];

  @ApiPropertyOptional({ type: Boolean, default: false })
  @ValidateIf(present)
  @IsBoolean()
  allowsMultiple?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    default: false,
    description: 'Hide who voted for what. Counts stay visible.',
  })
  @ValidateIf(present)
  @IsBoolean()
  anonymous?: boolean;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Automatic close time, at most 30 days ahead.',
  })
  @ValidateIf(present)
  @Type(() => Date)
  @IsDate()
  closesAt?: Date;
}

export class CreateChatMessageDto {
  @ApiPropertyOptional({
    type: String,
    minLength: 1,
    maxLength: 2000,
    description: 'Required for polls, where it is the question.',
  })
  @ValidateIf(present)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 1 })
  @ValidateIf(present)
  @IsInt()
  @Min(1)
  replyToId?: number;

  @ApiPropertyOptional({
    type: 'integer',
    isArray: true,
    maxItems: 20,
    description: 'Room members mentioned in the text.',
  })
  @ValidateIf(present)
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  mentionedUserIds?: number[];

  @ApiPropertyOptional({
    type: () => ChatMovieMentionDto,
    isArray: true,
    maxItems: 5,
  })
  @ValidateIf(present)
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => ChatMovieMentionDto)
  movies?: ChatMovieMentionDto[];

  @ApiPropertyOptional({ type: () => ChatPollDto })
  @ValidateIf(present)
  @ValidateNested()
  @Type(() => ChatPollDto)
  poll?: ChatPollDto;
}

export class UpdateChatMessageDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text: string;

  @ApiPropertyOptional({
    type: 'integer',
    isArray: true,
    maxItems: 20,
    description: 'Replaces the mentions when sent.',
  })
  @ValidateIf(present)
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  mentionedUserIds?: number[];
}

export class ChatReactionDto {
  @ApiProperty({ type: String, maxLength: 32, example: '🍿' })
  @IsString()
  @MaxLength(32)
  @Matches(EMOJI_PATTERN, { message: 'emoji must contain only emoji' })
  emoji: string;
}

export class ChatPollVoteDto {
  @ApiProperty({
    type: 'integer',
    isArray: true,
    maxItems: 10,
    description: 'Replaces your votes. An empty array retracts them.',
  })
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  optionIds: number[];
}

export class ChatReadDto {
  @ApiProperty({ type: 'integer', minimum: 1 })
  @IsInt()
  @Min(1)
  messageId: number;
}
