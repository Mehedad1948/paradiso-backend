import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoomInviteLink } from '../room-invite-link.entity';
import { REQUEST } from '@nestjs/core';
import { REQUEST_USER_KEY } from 'src/auth/constants/auth.constants';
import { ActiveUserData } from 'src/auth/interfaces/active-user-data.interface';

@Injectable()
export class GetOneRoomInviteLinkProvider {
  constructor(
    @InjectRepository(RoomInviteLink)
    private readonly repo: Repository<RoomInviteLink>,

    // @Inject(REQUEST) private readonly request: Request,
  ) {}

  async getByToken(token: string) {
    // const { id, email } = this.request[REQUEST_USER_KEY];

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
    if (invite.expiresAt && invite.expiresAt < new Date()) {
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
            name: invite.createdBy.avatar,
            avatar: invite.createdBy.avatar,
          }
        : null,
      canJoin,
      message,
    };
  }
}
