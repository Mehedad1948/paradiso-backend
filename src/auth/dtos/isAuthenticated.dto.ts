import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class IsAuthenticatedDto {
  @ApiProperty({ type: String })
  @IsString()
  userId: string;
}
