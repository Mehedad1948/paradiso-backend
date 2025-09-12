import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoomInviteLink } from '../room-invite-link.entity';
import { GetRoomInviteLinkDto } from '../dto/get-room-invite-link.dto';
import { PaginationProvider } from 'src/common/pagination/providers/pagination.provider';

@Injectable()
export class GetRoomInviteLinkProvider {
  constructor(
    @InjectRepository(RoomInviteLink)
    private readonly repo: Repository<RoomInviteLink>,
    private readonly paginationProvider: PaginationProvider,
  ) {}

  async getAll({ roomId, page, limit }: GetRoomInviteLinkDto) {
    const query = this.repo
      .createQueryBuilder('invite')
      .leftJoin('invite.createdBy', 'user')
      .where('invite.room = :roomId', { roomId })
      .andWhere('invite.isActive = true')
      .select([
        'invite.id',
        'invite.token',
        'invite.expiresAt',
        'invite.maxUses',
        'invite.uses',
        'invite.createdAt',
        'user.id',
        'user.username',
        'user.avatar',
      ])
      .orderBy('invite.createdAt', 'DESC');

    const paginatedInvites = await this.paginationProvider.paginateQuery(
      { page, limit },
      query,
    );

    // map invites into response format (adding full URL)
    return {
      ...paginatedInvites,
      items: paginatedInvites.data.map((invite) => ({
        ...invite,
        inviteUrl: `${process.env.APP_URL}/invitation/${invite.token}`,
      })),
    };
  }
}
