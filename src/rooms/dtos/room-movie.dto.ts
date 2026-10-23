import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
export class AddRoomMovieDto {
  @ApiProperty({ type: 'integer', format: 'int32', minimum: 1 })
  @IsInt()
  @Min(1)
  dbId: number;

  @ApiPropertyOptional({ type: Boolean, nullable: true })
  @IsOptional()
  @IsBoolean()
  isWatchedTogether?: boolean;
}
export class RemoveRoomMovieDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  movieId: string;
}
