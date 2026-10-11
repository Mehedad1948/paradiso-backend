import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ResendVerificationDto {
  @ApiProperty({ type: String, format: 'email', minLength: 1 })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
