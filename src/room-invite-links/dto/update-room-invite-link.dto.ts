import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';

export class UpdateRoomInviteLinkDto {
  @ApiPropertyOptional({ type: Boolean, nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    type: 'integer',
    format: 'int32',
    minimum: 0,
    nullable: true,
    description: '0 means unlimited uses.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxUsage?: number;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
