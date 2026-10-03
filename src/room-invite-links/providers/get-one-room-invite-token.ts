import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoomInviteLink } from '../room-invite-link.entity';

@Injectable()
export class GetOneRoomInviteLinkProvider {
  constructor(
    @InjectRepository(RoomInviteLink)
    private readonly repo: Repository<RoomInviteLink>,
  ) {}

  async getByToken(token: string) {
    const invite = await this.repo.findOne({
      where: { token, isActive: true },
      relations: ['room', 'createdBy'],
    });

    if (!invite) {
      throw new NotFoundException('Invite link not found');
    }

    let canJoin = true;
    let message: string | null = null;

    // Check expiration
    if (invite.expiresAt && invite.expiresAt <= new Date()) {
      canJoin = false;
      message = 'This invite link has expired.';
    }

    // Check usage
    if (invite.maxUsage > 0 && invite.uses >= invite.maxUsage) {
      canJoin = false;
      message = 'This invite link has already been used up.';
    }

    // Build response for frontend
    return {
      room: {
        id: invite.room.id,
        name: invite.room.name,
        description: invite.room.description,
        image: invite.room.image,
      },
      inviter: invite.createdBy
        ? {
            id: invite.createdBy.id,
            name: invite.createdBy.username,
            avatar: invite.createdBy.avatar,
          }
        : null,
      canJoin,
      message,
    };
  }
}
