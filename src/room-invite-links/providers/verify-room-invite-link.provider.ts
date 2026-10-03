import { AuthenticatedRequest } from '../../auth/interfaces/authenticated-request.interface';
import {
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { REQUEST_USER_KEY } from '../../auth/constants/auth.constants';
import { Room } from '../../rooms/room.entity';
import { lockRoom } from '../../rooms/providers/room-transaction';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoomInviteLink } from '../room-invite-link.entity';

@Injectable()
export class VerifyRoomInviteLinkProvider {
  constructor(
    @Inject(REQUEST) private readonly request: AuthenticatedRequest,
    @InjectRepository(RoomInviteLink)
    private readonly repo: Repository<RoomInviteLink>,
  ) {}

  async verify(token: string) {
    const userId = this.request[REQUEST_USER_KEY]?.sub;
    if (!userId) throw new UnauthorizedException();
    // Resolve the room first so all room writers acquire locks in the same order.
    const reference = await this.repo.findOne({
      where: { token },
      relations: ['room'],
    });
    if (!reference) throw new NotFoundException('Invite link not found');
    return this.repo.manager.transaction(async (manager) => {
      await lockRoom(manager, reference.room.id);
      const links = manager.getRepository(RoomInviteLink);
      const invite = await links
        .createQueryBuilder('invite')
        .where('invite.token = :token', { token })
        .setLock('pessimistic_write')
        .getOne();
      if (!invite || !invite.isActive)
        throw new NotFoundException('Invite link not found');
      if (invite.expiresAt && invite.expiresAt <= new Date())
        throw new GoneException('Invite link expired');
      const joined = await manager
        .getRepository(Room)
        .exists({ where: { id: reference.room.id, users: { id: userId } } });
      if (!joined) {
        if (invite.maxUsage > 0 && invite.uses >= invite.maxUsage)
          throw new GoneException('Invite link already used up');
        await manager
          .createQueryBuilder()
          .relation(Room, 'users')
          .of(reference.room.id)
          .add(userId);
        invite.uses += 1;
        await links.save(invite);
      }
      return {
        room: { id: reference.room.id, name: reference.room.name },
        message: 'You have joined the room',
      };
    });
  }
}
