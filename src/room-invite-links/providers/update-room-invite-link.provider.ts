import { AuthenticatedRequest } from '../../auth/interfaces/authenticated-request.interface';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateRoomInviteLinkDto } from '../dto/update-room-invite-link.dto';
import { RoomInviteLink } from '../room-invite-link.entity';
import { RoomAccessService } from '../../rooms/providers/room-access.service';
import { REQUEST_USER_KEY } from '../../auth/constants/auth.constants';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UpdateRoomInviteLinkProvider {
  constructor(
    @Inject(REQUEST) private readonly request: AuthenticatedRequest,

    @InjectRepository(RoomInviteLink)
    private readonly repo: Repository<RoomInviteLink>,
    private readonly access: RoomAccessService,
    private readonly config: ConfigService,
  ) {}

  async updateLink(
    id: number,
    roomId: number,
    updateDto: UpdateRoomInviteLinkDto,
  ) {
    await this.access.requireOwner(roomId, this.request[REQUEST_USER_KEY]?.sub);
    return this.repo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(RoomInviteLink);
      const query = repo
        .createQueryBuilder('invite')
        .where('invite.id = :id AND invite.room = :roomId', { id, roomId })
        .setLock('pessimistic_write');

      const invite = await query.getOne();

      if (!invite) {
        throw new NotFoundException('Invite link not found');
      }

      // Apply updates safely
      if (typeof updateDto.isActive === 'boolean') {
        invite.isActive = updateDto.isActive;
      }

      if (typeof updateDto.maxUsage === 'number') {
        invite.maxUsage = updateDto.maxUsage;
      }

      if (updateDto.expiresAt) {
        invite.expiresAt = new Date(updateDto.expiresAt);
      }

      const updated = await repo.save(invite);

      return {
        ...updated,
        inviteUrl: `${this.config.get<string>('appConfig.productBaseUrl')}/invitation/${updated.token}`,
      };
    });
  }
}
