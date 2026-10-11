import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsBoolean,
  MaxLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateRoomDto {
  @ApiProperty({ type: String, maxLength: 255, minLength: 1 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  name: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: Boolean, nullable: true })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    pattern: '^#[0-9a-fA-F]{6}$',
    example: '#ff5733',
    description: 'Room theme color as a #RRGGBB hex code.',
  })
  @IsOptional()
  @Matches(/^#[0-9a-f]{6}$/i, {
    message: 'themeColor must be a #RRGGBB hex code',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  themeColor?: string | null;
}
