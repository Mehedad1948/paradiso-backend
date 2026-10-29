import { ApiPropertyOptional } from '@nestjs/swagger';
import { IntersectionType, OmitType } from '@nestjs/swagger';
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

// GET /rooms/public: page and limit only.
export class GetPublicRoomsDto extends PaginationQueryDto {}

// GET /rooms/mine: always the caller's rooms, so no usersRoom switch.
export class GetMyRoomsDto extends OmitType(GetRoomDto, ['usersRoom']) {}
