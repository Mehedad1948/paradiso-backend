import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ type: String, minLength: 1 })
  @IsNotEmpty()
  @IsString()
  refreshToken: string;
}
