import { Injectable } from '@nestjs/common';
import { CreateRoomInviteLinkDto } from '../dto/create-room-invite-link.dto';
import { GetRoomInviteLinkDto } from '../dto/get-room-invite-link.dto';
import { UpdateRoomInviteLinkDto } from '../dto/update-room-invite-link.dto';
import { CreateRoomInviteLinkProvider } from './create-room-invite-link.provider';
import { GetRoomInviteLinkProvider } from './get-room-invite-link.provider';
import { VerifyRoomInviteLinkProvider } from './verify-room-invite-link.provider';
import { UpdateRoomInviteLinkProvider } from './update-room-invite-link.provider';
import { DeleteRoomInviteLinkProvider } from './delete-room-invite-link.provider';
import { GetOneRoomInviteLinkProvider } from './get-one-room-invite-token';

@Injectable()
export class RoomInviteLinksService {
  constructor(
    private readonly createProvider: CreateRoomInviteLinkProvider,
    private readonly getProvider: GetRoomInviteLinkProvider,
    private readonly verifyProvider: VerifyRoomInviteLinkProvider,
    private readonly updateProvider: UpdateRoomInviteLinkProvider,
    private readonly deleteProvider: DeleteRoomInviteLinkProvider,
    private readonly getOneRoomInviteLinkProvider: GetOneRoomInviteLinkProvider,
  ) {}
  create(createRoomInviteLinkDto: CreateRoomInviteLinkDto) {
    return this.createProvider.create(createRoomInviteLinkDto);
  }

  findAll(getRoomInviteLinkDto: GetRoomInviteLinkDto) {
    return this.getProvider.getAll(getRoomInviteLinkDto);
  }

  getOne(token: string) {
    return this.getOneRoomInviteLinkProvider.getByToken(token);
  }

  verify(token: string) {
    return this.verifyProvider.verify(token);
  }

  update(id: string, updateRoomInviteLinkDto: UpdateRoomInviteLinkDto) {
    return this.updateProvider.updateLink(id, updateRoomInviteLinkDto);
  }

  remove(id: number) {
    return this.deleteProvider.deleteLink(Number(id));
  }
}
