import { IntersectionType } from '@nestjs/mapped-types';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PaginationQueryDto } from 'src/common/pagination/dtos/pagination-query.dto';

export enum MovieSortOption {
  RATE = 'rate',
  USER_RATE = 'userRate',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

class GetMoviesBaseDto {
  @IsOptional()
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @IsDate()
  endDate?: Date;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBoolean()
  isWatchTogether?: boolean;

  @IsOptional()
  @IsEnum(MovieSortOption)
  sortBy?: MovieSortOption;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder;

  @IsOptional()
  @IsString()
  sortByUserId?: string;
}

export class GetRatingDto extends IntersectionType(
  GetMoviesBaseDto,
  PaginationQueryDto,
) {}
