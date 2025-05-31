// create-user.dto.ts
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUserDto {
  // @IsEmail()
  // email?: string;

  @IsString()
  @MinLength(6)
  @IsOptional()
  password?: string;

  @IsString()
  @IsOptional()
  username?: string;

  @IsOptional()
  @IsString()
  @IsOptional()
  avatar?: string;
}
