import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoomInviteLink } from '../room-invite-link.entity';
import { v4 as uuid } from 'uuid';
import { CreateRoomInviteLinkDto } from '../dto/create-room-invite-link.dto';
import { REQUEST } from '@nestjs/core';
import { REQUEST_USER_KEY } from 'src/auth/constants/auth.constants';

@Injectable()
export class CreateRoomInviteLinkProvider {
  constructor(
    @Inject(REQUEST) private readonly request: Request,

    @InjectRepository(RoomInviteLink)
    private readonly repo: Repository<RoomInviteLink>,
  ) {}

  async create(dto: CreateRoomInviteLinkDto) {
    const userId = this.request[REQUEST_USER_KEY]?.sub;

    const invite = this.repo.create({
      room: { id: dto.roomId },
      createdBy: { id: userId },
      token: uuid(),
      maxUsage: 0,
    });

    return this.repo.save(invite);
  }
}
