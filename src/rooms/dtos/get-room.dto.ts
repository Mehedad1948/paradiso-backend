import { ApiPropertyOptional } from '@nestjs/swagger';
import { IntersectionType } from '@nestjs/swagger';
import { IsDate, IsOptional, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../common/pagination/dtos/pagination-query.dto';

class GetRoomBaseDto {
  @ApiPropertyOptional({ enum: ['true', 'false'], nullable: true })
  @IsOptional()
  @IsIn(['true', 'false'])
  usersRoom?: string;

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

export class GetRoomDto extends IntersectionType(
  GetRoomBaseDto,
  PaginationQueryDto,
) {}
