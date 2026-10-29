import { ApiPropertyOptional } from '@nestjs/swagger';
import { IntersectionType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/dtos/pagination-query.dto';

export const MAX_MOVIE_SEARCH = 100;

class GetMoviesBaseDto {
  @ApiPropertyOptional({
    type: String,
    maxLength: MAX_MOVIE_SEARCH,
    description:
      'Case-insensitive text found in title or original_title. Blank is ignored. Combines with the date filters and pagination.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MaxLength(MAX_MOVIE_SEARCH)
  search?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDate?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date;
}

export class GetMovieDto extends IntersectionType(
  GetMoviesBaseDto,
  PaginationQueryDto,
) {}
