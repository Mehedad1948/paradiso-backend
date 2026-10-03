import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class SignInDto {
  @ApiProperty({ type: String, format: 'email', minLength: 1 })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ type: String, minLength: 1, writeOnly: true })
  @IsNotEmpty()
  @IsString()
  password: string;
}
