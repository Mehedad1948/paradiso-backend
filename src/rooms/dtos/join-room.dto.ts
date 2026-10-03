import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

export class JoinRoomDto {
  @ApiPropertyOptional({
    type: 'integer',
    format: 'int32',
    minimum: 1,
    nullable: true,
    deprecated: true,
    description: 'Ignored. The authenticated user joins the room.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  userId?: number;

  @ApiProperty({ type: 'integer', format: 'int32', minimum: 1 })
  @IsInt()
  @Min(1)
  roomId: number;
}
