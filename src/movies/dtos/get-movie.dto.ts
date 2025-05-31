import { IntersectionType } from '@nestjs/mapped-types';
import { IsDate, IsOptional } from 'class-validator';
import { PaginationQueryDto } from 'src/common/pagination/dtos/pagination-query.dto';
class GetMoviesBaseDto {
  @IsOptional()
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @IsDate()
  endDate?: Date;
}

export class GetMovieDto extends IntersectionType(
  GetMoviesBaseDto,
  PaginationQueryDto,
) {}
