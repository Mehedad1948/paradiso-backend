import { Injectable } from '@nestjs/common';
import { PaginationProvider } from '../../common/pagination/providers/pagination.provider';
import { RoomAccessService } from '../../rooms/providers/room-access.service';
import {
  GetRoomInvitationsDto,
  ListMyInvitationsQueryDto,
} from '../dto/get-room-inviations.dto';
import {
  applyStatusFilter,
  InvitationLifecycleService,
} from '../invitation-lifecycle.service';

@Injectable()
export class GetRoomInvitationProvider {
  constructor(
    private readonly access: RoomAccessService,
    private readonly paginationProvider: PaginationProvider,
    private readonly lifecycle: InvitationLifecycleService,
  ) {}

  private async page(
    dto: ListMyInvitationsQueryDto,
    builder: ReturnType<InvitationLifecycleService['query']>,
  ) {
    const result = await this.paginationProvider.paginateQuery(
      dto,
      builder
        .orderBy('invitation.createdAt', 'DESC')
        .addOrderBy('invitation.id', 'DESC'),
    );
    return { ...result, data: result.data.map((i) => this.lifecycle.view(i)) };
  }

  // Everything sent for a room, including invitations waiting for approval.
  async forRoom(dto: GetRoomInvitationsDto, userId: number) {
    await this.access.requireOwner(dto.roomId, userId);
    return this.page(
      dto,
      applyStatusFilter(
        this.lifecycle
          .query()
          .where('invitation.room = :roomId', { roomId: dto.roomId }),
        dto.status,
      ),
    );
  }

  // Invitations addressed to the user, minus the ones they were never shown.
  forInvitee(dto: ListMyInvitationsQueryDto, userId: number) {
    return this.page(
      dto,
      applyStatusFilter(
        this.lifecycle
          .query()
          .where('invitation.inviteeUserId = :userId', { userId })
          .andWhere('invitation.pendingAt IS NOT NULL'),
        dto.status,
      ),
    );
  }
}
