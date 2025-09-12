import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RoomInvitationService } from './providers/invitations.service';
import { InviteUserToRoomDto } from './dto/invite-user-to-room.dto';

@Controller('rooms/:roomId/invitations')
export class RoomInvitationsController {
  constructor(private readonly invitationService: RoomInvitationService) {}

  @Post()
  async inviteUser(
    @Param('roomId') roomId: number,
    @Body() inviteUserToRoomDto: InviteUserToRoomDto,
  ) {
    return this.invitationService.inviteUser(inviteUserToRoomDto, roomId);
  }

  @Get()
  async getRoomInvitations(
    @Param('roomId') roomId: number,
    @Query('limit') limit: number,
    @Query('page') page = 1,
  ) {
    return this.invitationService.getRoomInvitations({ roomId, page, limit });
  }
}
