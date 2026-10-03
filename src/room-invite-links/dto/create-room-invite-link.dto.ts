import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';

export class CreateRoomInviteLinkDto {
  @ApiPropertyOptional({
    type: 'integer',
    format: 'int32',
    minimum: 1,
    nullable: true,
    deprecated: true,
    description: 'Ignored. The roomId path parameter is authoritative.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  roomId: number;

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
