import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RoomInvitationService } from './providers/invitations.service';
import { InviteUserToRoomDto } from './dto/invite-user-to-room.dto';

@Controller('room-invitations')
export class RoomInvitationsController {
  constructor(private readonly invitationService: RoomInvitationService) {}

  @Post(':roomId')
  async inviteUser(
    @Param('roomId') roomId: number,
    @Body() inviteUserToRoomDto: InviteUserToRoomDto,
  ) {
    return await this.invitationService.inviteUser(inviteUserToRoomDto, roomId);
  }

  @Get(':roomId')
  async getRoomInvitations(@Param('roomId') roomId: number) {
    return await this.invitationService.getRoomInvitations(roomId);
  }
}
