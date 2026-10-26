import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/dtos/pagination-query.dto';
import {
  INVITATION_STATUSES,
  InvitationStatus,
} from '../room-invitation.entity';

export class ListRoomInvitationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: INVITATION_STATUSES })
  @IsOptional()
  @IsIn(INVITATION_STATUSES)
  status?: InvitationStatus;
}

// What an invitee has been shown: invitations that were never pending
// (awaiting approval or rejected) are not theirs to see.
export const INVITEE_VISIBLE_STATUSES = [
  'pending',
  'accepted',
  'declined',
  'cancelled',
  'expired',
] as const;

export class ListMyInvitationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: INVITEE_VISIBLE_STATUSES })
  @IsOptional()
  @IsIn(INVITEE_VISIBLE_STATUSES)
  status?: InvitationStatus;
}

export type GetRoomInvitationsDto = ListRoomInvitationsQueryDto & {
  roomId: number;
};
