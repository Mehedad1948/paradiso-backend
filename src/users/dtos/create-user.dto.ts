import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
// create-user.dto.ts
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateUserDto {
  @ApiProperty({ type: String, format: 'email' })
  @IsEmail()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @ApiProperty({ type: String, minLength: 6, writeOnly: true })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ type: String })
  @IsString()
  username: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  avatar?: string;
}
