import {
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoomInviteLink } from '../room-invite-link.entity';
import { REQUEST } from '@nestjs/core';
import { REQUEST_USER_KEY } from 'src/auth/constants/auth.constants';

@Injectable()
export class DeleteRoomInviteLinkProvider {
  constructor(
    @Inject(REQUEST) private readonly request: Request,

    @InjectRepository(RoomInviteLink)
    private readonly repo: Repository<RoomInviteLink>,
  ) {}

  async deleteLink(id: number) {
    const userId = this.request[REQUEST_USER_KEY]?.sub;

    const invite = await this.repo.findOne({
      where: { id: Number(id) },
      relations: ['createdBy'],
    });

    if (!invite) {
      throw new NotFoundException('Invite link not found');
    }

    // if (invite.createdBy?.id !== userId) {
    //   throw new ForbiddenException(
    //     'You are not allowed to delete this invite link',
    //   );
    // }

    await this.repo.remove(invite);

    return { message: 'Invite link deleted successfully', id };
  }
}
