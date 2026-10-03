import { AuthenticatedRequest } from '../../auth/interfaces/authenticated-request.interface';
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoomInviteLink } from '../room-invite-link.entity';
import { v4 as uuid } from 'uuid';
import { CreateRoomInviteLinkDto } from '../dto/create-room-invite-link.dto';
import { REQUEST } from '@nestjs/core';
import { REQUEST_USER_KEY } from '../../auth/constants/auth.constants';
import { RoomAccessService } from '../../rooms/providers/room-access.service';

@Injectable()
export class CreateRoomInviteLinkProvider {
  constructor(
    @Inject(REQUEST) private readonly request: AuthenticatedRequest,

    @InjectRepository(RoomInviteLink)
    private readonly repo: Repository<RoomInviteLink>,
    private readonly access: RoomAccessService,
  ) {}

  async create(dto: CreateRoomInviteLinkDto) {
    const userId = this.request[REQUEST_USER_KEY]?.sub;
    await this.access.requireOwner(dto.roomId, userId);

    const invite = this.repo.create({
      room: { id: dto.roomId },
      createdBy: { id: userId },
      token: uuid(),
      maxUsage: dto.maxUsage ?? 0,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    });

    return this.repo.save(invite);
  }
}
