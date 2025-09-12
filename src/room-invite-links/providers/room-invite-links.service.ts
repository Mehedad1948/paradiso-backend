import { Injectable } from '@nestjs/common';
import { CreateRoomInviteLinkDto } from '../dto/create-room-invite-link.dto';
import { GetRoomInviteLinkDto } from '../dto/get-room-invite-link.dto';
import { UpdateRoomInviteLinkDto } from '../dto/update-room-invite-link.dto';
import { CreateRoomInviteLinkProvider } from './create-room-invite-link.provider';
import { GetRoomInviteLinkProvider } from './get-room-invite-link.provider';
import { VerifyRoomInviteLinkProvider } from './verify-room-invite-link.provider';
import { UpdateRoomInviteLinkProvider } from './update-room-invite-link.provider';
import { DeleteRoomInviteLinkProvider } from './delete-room-invite-link.provider';

@Injectable()
export class RoomInviteLinksService {
  constructor(
    private readonly createProvider: CreateRoomInviteLinkProvider,
    private readonly getProvider: GetRoomInviteLinkProvider,
    private readonly verifyProvider: VerifyRoomInviteLinkProvider,
    private readonly updateProvider: UpdateRoomInviteLinkProvider,
    private readonly deleteProvider: DeleteRoomInviteLinkProvider,
  ) {}
  create(createRoomInviteLinkDto: CreateRoomInviteLinkDto) {
    return this.createProvider.create(createRoomInviteLinkDto);
  }

  findAll(getRoomInviteLinkDto: GetRoomInviteLinkDto) {
    return this.getProvider.getAll(getRoomInviteLinkDto);
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
