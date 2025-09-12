import { IntersectionType } from '@nestjs/mapped-types';
import { IsDate, IsNumber, IsOptional } from 'class-validator';
import { PaginationQueryDto } from 'src/common/pagination/dtos/pagination-query.dto';

class GetInvitationLinkBaseDto {
  @IsOptional()
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @IsDate()
  endDate?: Date;

  @IsNumber()
  roomId: number;
}

export class GetRoomInviteLinkDto extends IntersectionType(
  GetInvitationLinkBaseDto,
  PaginationQueryDto,
) {}
