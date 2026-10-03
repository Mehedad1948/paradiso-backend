import { ApiPropertyOptional } from '@nestjs/swagger';
import { IntersectionType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/dtos/pagination-query.dto';

class GetRoomRatingsBaseDto {
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

export class GetRoomRatingDto extends IntersectionType(
  GetRoomRatingsBaseDto,
  PaginationQueryDto,
) {}
