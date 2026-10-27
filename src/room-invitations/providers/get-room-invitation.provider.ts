import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationProvider } from '../../common/pagination/providers/pagination.provider';
import { RoomAccessService } from '../../rooms/providers/room-access.service';
import {
  GetRoomInvitationsDto,
  ListMyInvitationsQueryDto,
  ListSentInvitationsQueryDto,
} from '../dto/get-room-inviations.dto';
import {
  applyStatusFilter,
  InvitationLifecycleService,
} from '../invitation-lifecycle.service';
import {
  INVITATION_STATUSES,
  InvitationStatus,
  OPEN_INVITATION_STATUSES,
  RoomInvitation,
} from '../room-invitation.entity';

const OPEN_SQL = OPEN_INVITATION_STATUSES.map((s) => `'${s}'`).join(', ');

@Injectable()
export class GetRoomInvitationProvider {
  constructor(
    private readonly access: RoomAccessService,
    private readonly paginationProvider: PaginationProvider,
    private readonly lifecycle: InvitationLifecycleService,
    @InjectRepository(RoomInvitation)
    private readonly invitations: Repository<RoomInvitation>,
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

  // Everything the user sent, from any room, with counts per status. The
  // counts ignore the status filter so the UI can label its tabs.
  async forInviter(dto: ListSentInvitationsQueryDto, userId: number) {
    const [result, summary] = await Promise.all([
      this.page(
        dto,
        applyStatusFilter(
          this.lifecycle
            .query()
            .where('invitation.inviterId = :userId', { userId }),
          dto.status,
        ),
      ),
      this.summaryFor(userId),
    ]);
    return { ...result, summary };
  }

  private async summaryFor(userId: number) {
    const rows = await this.invitations
      .createQueryBuilder('invitation')
      .select(
        `CASE WHEN invitation.status IN (${OPEN_SQL}) AND invitation.expiresAt <= now() THEN 'expired' ELSE invitation.status END`,
        'status',
      )
      .addSelect('COUNT(*)::int', 'count')
      .where('invitation.inviterId = :userId', { userId })
      .groupBy('1')
      .getRawMany<{ status: InvitationStatus; count: number }>();
    const summary = Object.fromEntries(
      INVITATION_STATUSES.map((status) => [status, 0]),
    ) as Record<InvitationStatus, number>;
    let total = 0;
    for (const row of rows) {
      summary[row.status] = row.count;
      total += row.count;
    }
    return { total, ...summary };
  }
}
