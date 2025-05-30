// create-user.dto.ts
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { IsUUID } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  username: string;

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsUUID()
  roleId: string; // assuming you'll set role relation by ID
}
