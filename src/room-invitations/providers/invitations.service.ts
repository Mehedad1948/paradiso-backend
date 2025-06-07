import { Injectable } from '@nestjs/common';
import { InviteUserToRoomDto } from '../dto/invite-user-to-room.dto';
import { AddUserToRoomProvider } from './add-user-to-room.provider';

@Injectable()
export class RoomInvitationService {
  constructor(private readonly addUserToRoomProvider: AddUserToRoomProvider) {}

  async inviteUser(inviteUserToRoomDto: InviteUserToRoomDto, roomId: number) {
    console.log('❌❌❌❌', this.addUserToRoomProvider);

    return await this.addUserToRoomProvider.inviteUserToRoom(
      inviteUserToRoomDto,
      roomId,
    );
  }
}
