import { AuthenticatedRequest } from '../../auth/interfaces/authenticated-request.interface';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { REQUEST_USER_KEY } from '../../auth/constants/auth.constants';
import { RoomAccessService } from '../../rooms/providers/room-access.service';
import { Repository } from 'typeorm';
import { RoomInvitation } from '../room-invitation.entity';
import { PaginationProvider } from '../../common/pagination/providers/pagination.provider';
import { GetRoomInvitationsDto } from '../dto/get-room-inviations.dto';

@Injectable()
export class GetRoomInvitationProvider {
  constructor(
    @Inject(REQUEST) private readonly request: AuthenticatedRequest,
    private readonly access: RoomAccessService,
    private readonly paginationProvider: PaginationProvider,
    @InjectRepository(RoomInvitation)
    private readonly roomInvitationRepository: Repository<RoomInvitation>,
  ) {}
  private query(roomId: number) {
    return this.roomInvitationRepository
      .createQueryBuilder('invitation')
      .leftJoin('invitation.invitedBy', 'inviter')
      .where('invitation.room = :roomId', { roomId })
      .select([
        'invitation.id',
        'invitation.email',
        'invitation.status',
        'invitation.userStatus',
        'invitation.createdAt',
        'inviter.id',
        'inviter.username',
        'inviter.avatar',
      ])
      .orderBy('invitation.createdAt', 'DESC')
      .addOrderBy('invitation.id', 'DESC');
  }
  async getRoomInvitation(dto: GetRoomInvitationsDto) {
    await this.access.requireOwner(
      dto.roomId,
      this.request[REQUEST_USER_KEY]?.sub,
    );
    return this.paginationProvider.paginateQuery(dto, this.query(dto.roomId));
  }
  async getInvitationByRoomIdAndEmail(roomId: number, email: string) {
    await this.access.requireOwner(roomId, this.request[REQUEST_USER_KEY]?.sub);
    const invitation = await this.query(roomId)
      .andWhere('invitation.email = :email', {
        email: email.trim().toLowerCase(),
      })
      .getOne();
    if (!invitation) throw new NotFoundException('Invitation not found');
    return invitation;
  }
}
