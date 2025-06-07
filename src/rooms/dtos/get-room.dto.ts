import { IntersectionType } from '@nestjs/mapped-types';
import { IsDate, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from 'src/common/pagination/dtos/pagination-query.dto';

class GetRoomBaseDto {
  @IsOptional()
  @IsString()
  usersRoom?: string;

  @IsOptional()
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @IsDate()
  endDate?: Date;
}

export class GetRoomDto extends IntersectionType(
  GetRoomBaseDto,
  PaginationQueryDto,
) {}
