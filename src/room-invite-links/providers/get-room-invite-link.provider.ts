import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoomInviteLink } from '../room-invite-link.entity';
import { GetRoomInviteLinkDto } from '../dto/get-room-invite-link.dto';
import { PaginationProvider } from 'src/common/pagination/providers/pagination.provider';
import { ConfigType } from '@nestjs/config';
import appConfig from 'src/config/app.config';

@Injectable()
export class GetRoomInviteLinkProvider {
  constructor(
    @InjectRepository(RoomInviteLink)
    private readonly repo: Repository<RoomInviteLink>,
    private readonly paginationProvider: PaginationProvider,

    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  async getAll({ roomId, page, limit }: GetRoomInviteLinkDto) {
    const query = this.repo
      .createQueryBuilder('invite')
      .leftJoin('invite.createdBy', 'user')
      .where('invite.room = :roomId', { roomId })
      .select([
        'invite.id',
        'invite.token',
        'invite.expiresAt',
        'invite.isActive',
        'invite.maxUsage',
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

    return {
      ...paginatedInvites,
      data: paginatedInvites.data.map((invite) => ({
        ...invite,
        inviteUrl: `${this.config.productBaseUrl}/invitation/${invite.token}`,
      })),
    };
  }
}
