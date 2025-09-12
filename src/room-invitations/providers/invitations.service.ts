import { Injectable } from '@nestjs/common';
import { InviteUserToRoomDto } from '../dto/invite-user-to-room.dto';
import { AddUserToRoomProvider } from './add-user-to-room.provider';
import { GetRoomInvitationProvider } from './get-room-invitation.provider';
import { GetRoomInvitationsDto } from '../dto/get-room-inviations.dto';

@Injectable()
export class RoomInvitationService {
  constructor(
    private readonly addUserToRoomProvider: AddUserToRoomProvider,
    private readonly getRoomInvitationProvider: GetRoomInvitationProvider,
  ) {}

  async inviteUser(inviteUserToRoomDto: InviteUserToRoomDto, roomId: number) {
    console.log('addUserToRoomProvider', this.addUserToRoomProvider); // => THis logs as empty {}

    return await this.addUserToRoomProvider.inviteUserToRoom(
      inviteUserToRoomDto,
      roomId,
    );
  }

  async getRoomInvitations(getRoomInvitationsDto: GetRoomInvitationsDto) {
    return await this.getRoomInvitationProvider.getRoomInvitation(
      getRoomInvitationsDto,
    );
  }

  async getInvitationByRoomIdAndEmail(roomId: number, email: string) {
    return await this.getRoomInvitationProvider.getInvitationByRoomIdAndEmail(
      roomId,
      email,
    );
  }
}
