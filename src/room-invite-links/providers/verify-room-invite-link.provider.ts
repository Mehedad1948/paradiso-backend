import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoomInviteLink } from '../room-invite-link.entity';

@Injectable()
export class VerifyRoomInviteLinkProvider {
  constructor(
    @InjectRepository(RoomInviteLink)
    private readonly repo: Repository<RoomInviteLink>,
  ) {}

  async verify(token: string) {
    const invite = await this.repo.findOne({
      where: { token, isActive: true },
      relations: ['room'],
    });

    if (!invite) {
      throw new Error('Invalid or expired invite link');
    }

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new Error('Invite link expired');
    }

    if (invite.maxUsage > 0 && invite.uses >= invite.maxUsage) {
      throw new Error('Invite link already used up');
    }

    invite.uses += 1;
    await this.repo.save(invite);

    return invite.room;
  }
}
