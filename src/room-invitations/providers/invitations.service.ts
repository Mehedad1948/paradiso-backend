import { Injectable } from '@nestjs/common';
import { InviteUserToRoomDto } from '../dto/invite-user-to-room.dto';
import {
  GetRoomInvitationsDto,
  ListMyInvitationsQueryDto,
  ListSentInvitationsQueryDto,
} from '../dto/get-room-inviations.dto';
import { CreateInvitationProvider } from './create-invitation.provider';
import { GetRoomInvitationProvider } from './get-room-invitation.provider';
import { InvitableRoomsProvider } from './invitable-rooms.provider';
import { InvitationActionsProvider } from './invitation-actions.provider';

@Injectable()
export class RoomInvitationService {
  constructor(
    private readonly createProvider: CreateInvitationProvider,
    private readonly getProvider: GetRoomInvitationProvider,
    private readonly actions: InvitationActionsProvider,
    private readonly invitableRooms: InvitableRoomsProvider,
  ) {}

  inviteUser(dto: InviteUserToRoomDto, roomId: number, userId: number) {
    return this.createProvider.create(dto, roomId, userId);
  }

  getRoomInvitations(dto: GetRoomInvitationsDto, userId: number) {
    return this.getProvider.forRoom(dto, userId);
  }

  getMyInvitations(dto: ListMyInvitationsQueryDto, userId: number) {
    return this.getProvider.forInvitee(dto, userId);
  }

  getSentInvitations(dto: ListSentInvitationsQueryDto, userId: number) {
    return this.getProvider.forInviter(dto, userId);
  }

  listInvitableRooms(targetUserId: number, userId: number) {
    return this.invitableRooms.list(targetUserId, userId);
  }

  accept(id: number, userId: number) {
    return this.actions.accept(id, userId);
  }
  decline(id: number, userId: number) {
    return this.actions.decline(id, userId);
  }
  approve(id: number, userId: number) {
    return this.actions.approve(id, userId);
  }
  reject(id: number, userId: number) {
    return this.actions.reject(id, userId);
  }
  cancel(id: number, userId: number) {
    return this.actions.cancel(id, userId);
  }
}
