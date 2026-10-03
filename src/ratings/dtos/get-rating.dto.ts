import { ApiPropertyOptional } from '@nestjs/swagger';
import { IntersectionType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { queryBoolean } from '../../common/validation/query-boolean';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/dtos/pagination-query.dto';

export enum MovieSortOption {
  RATE = 'rate',
  USER_RATE = 'userRate',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

class GetMoviesBaseDto {
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

  @ApiPropertyOptional({ type: String, maxLength: 200, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ type: Boolean, nullable: true })
  @IsOptional()
  @IsBoolean()
  @Transform(queryBoolean)
  isWatchTogether?: boolean;

  @ApiPropertyOptional({ enum: MovieSortOption, nullable: true })
  @IsOptional()
  @IsEnum(MovieSortOption)
  sortBy?: MovieSortOption;

  @ApiPropertyOptional({ enum: SortOrder, nullable: true })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder;

  @ApiPropertyOptional({
    type: 'integer',
    format: 'int32',
    minimum: 1,
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sortByUserId?: number;
}

export class GetRatingDto extends IntersectionType(
  GetMoviesBaseDto,
  PaginationQueryDto,
) {}
