import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ type: String, minLength: 3 })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  name: string;
}
