import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';
export class AddRoomMovieDto {
  @ApiProperty({ type: 'integer', format: 'int32', minimum: 1 })
  @IsInt()
  @Min(1)
  dbId: number;
}
export class RemoveRoomMovieDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  movieId: string;
}
