import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsPositive, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginationQueryDto {
  @ApiPropertyOptional({
    type: 'integer',
    format: 'int32',
    maximum: 100,
    minimum: 1,
    default: 10,
    nullable: true,
  })
  @Type(() => Number)
  @Max(100)
  @IsNumber()
  @IsOptional()
  @IsPositive()
  @IsInt()
  limit?: number = 10;

  @ApiPropertyOptional({
    type: 'integer',
    format: 'int32',
    maximum: 1000000,
    minimum: 1,
    default: 1,
    nullable: true,
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @IsPositive()
  @IsInt()
  @Max(1000000)
  page?: number = 1;
}
