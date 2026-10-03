import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgetPasswordDto {
  @ApiProperty({ type: String, format: 'email', minLength: 1 })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
