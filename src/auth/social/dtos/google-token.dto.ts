import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class GoogleTokenDto {
  @ApiProperty({ type: String, minLength: 1 })
  @IsNotEmpty()
  token: string;
}
