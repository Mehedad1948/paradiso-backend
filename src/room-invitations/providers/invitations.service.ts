import { Injectable } from '@nestjs/common';
import { InviteUserToRoomDto } from '../dto/invite-user-to-room.dto';
import { AddUserToRoomProvider } from './add-user-to-room.provider';
import { GetRoomInvitationProvider } from './get-room-invitation.provider';

@Injectable()
export class RoomInvitationService {
  constructor(
    private readonly addUserToRoomProvider: AddUserToRoomProvider,
    private readonly getRoomInvitationProvider: GetRoomInvitationProvider,
  ) {}

  async inviteUser(inviteUserToRoomDto: InviteUserToRoomDto, roomId: number) {
    console.log('❌❌❌❌', this.addUserToRoomProvider);

    return await this.addUserToRoomProvider.inviteUserToRoom(
      inviteUserToRoomDto,
      roomId,
    );
  }

  async getRoomInvitations(roomId: number) {
    return await this.getRoomInvitationProvider.getRoomInvitation(roomId);
  }

  async getInvitationByRoomIdAndEmail(roomId: number, email: string) {
    return await this.getRoomInvitationProvider.getInvitationByRoomIdAndEmail(
      roomId,
      email,
    );
  }
}
