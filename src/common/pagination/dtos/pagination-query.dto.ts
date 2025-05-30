import { IsInt, IsNumber, IsOptional, IsPositive } from 'class-validator';

export class PaginationQueryDto {
  @IsNumber()
  @IsOptional()
  @IsPositive()
  @IsInt()
  limit?: number = 10;

  @IsNumber()
  @IsOptional()
  @IsPositive()
  @IsInt()
  //   @Type(() => Number) Replaced with transformOptions in main.ts
  page?: number = 1;
}
