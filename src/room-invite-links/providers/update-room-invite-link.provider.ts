import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateRoomInviteLinkDto } from '../dto/update-room-invite-link.dto';
import { RoomInviteLink } from '../room-invite-link.entity';

@Injectable()
export class UpdateRoomInviteLinkProvider {
  constructor(
    @Inject(REQUEST) private readonly request: Request,

    @InjectRepository(RoomInviteLink)
    private readonly repo: Repository<RoomInviteLink>,
  ) {}

  async updateLink(id: string, updateDto: UpdateRoomInviteLinkDto) {
    const query = this.repo
      .createQueryBuilder('invite')
      .leftJoinAndSelect('invite.createdBy', 'user')
      .where('invite.id = :id', { id });

    const invite = await query.getOne();

    if (!invite) {
      throw new NotFoundException('Invite link not found');
    }

    // Apply updates safely
    if (typeof updateDto.isActive === 'boolean') {
      invite.isActive = updateDto.isActive;
    }

    if (typeof updateDto.maxUsage === 'number') {
      invite.maxUses = updateDto.maxUsage;
    }

    if (updateDto.expiresAt) {
      invite.expiresAt = new Date(updateDto.expiresAt);
    }

    const updated = await this.repo.save(invite);

    return {
      ...updated,
      inviteUrl: `${process.env.APP_URL}/invitation/${updated.token}`,
    };
  }
}
