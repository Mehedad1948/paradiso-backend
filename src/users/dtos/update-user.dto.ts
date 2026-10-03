import { ApiPropertyOptional } from '@nestjs/swagger';
// create-user.dto.ts
import { IsString, MinLength, MaxLength, ValidateIf } from 'class-validator';

export class UpdateUserDto {
  // @IsEmail()
  // email?: string;

  @ApiPropertyOptional({ type: String, minLength: 6, writeOnly: true })
  @IsString()
  @MinLength(6)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  password?: string;

  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 100 })
  @IsString()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @MinLength(1)
  @MaxLength(100)
  username?: string;

  @ApiPropertyOptional({ type: String, maxLength: 255 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(255)
  avatar?: string;
}
