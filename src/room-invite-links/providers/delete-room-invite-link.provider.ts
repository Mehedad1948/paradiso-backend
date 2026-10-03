import { AuthenticatedRequest } from '../../auth/interfaces/authenticated-request.interface';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoomInviteLink } from '../room-invite-link.entity';
import { REQUEST } from '@nestjs/core';
import { REQUEST_USER_KEY } from '../../auth/constants/auth.constants';
import { RoomAccessService } from '../../rooms/providers/room-access.service';

@Injectable()
export class DeleteRoomInviteLinkProvider {
  constructor(
    @Inject(REQUEST) private readonly request: AuthenticatedRequest,

    @InjectRepository(RoomInviteLink)
    private readonly repo: Repository<RoomInviteLink>,
    private readonly access: RoomAccessService,
  ) {}

  async deleteLink(id: number, roomId: number) {
    const userId = this.request[REQUEST_USER_KEY]?.sub;
    await this.access.requireOwner(roomId, userId);

    const invite = await this.repo.findOne({
      where: { id, room: { id: roomId } },
    });

    if (!invite) {
      throw new NotFoundException('Invite link not found');
    }

    await this.repo.remove(invite);

    return { message: 'Invite link deleted successfully', id };
  }
}
