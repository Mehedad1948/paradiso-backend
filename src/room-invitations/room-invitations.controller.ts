import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ActiveUser } from '../auth/decorator/active-user.decorator';
import { InviteUserToRoomDto } from './dto/invite-user-to-room.dto';
import { ListRoomInvitationsQueryDto } from './dto/get-room-inviations.dto';
import { RoomInvitationService } from './providers/invitations.service';

@Controller('rooms/:roomId/invitations')
export class RoomInvitationsController {
  constructor(private readonly invitationService: RoomInvitationService) {}

  @Post()
  @ApiOperation({
    summary: 'Invite a user or an email address to the room.',
    description:
      'Room members only. Owners, and anyone inviting to a public room, create a pending invitation. A member inviting to a private room creates one awaiting_approval, which the owner must approve before the invited user sees it. Send exactly one of userId or email.',
  })
  inviteUser(
    @Param('roomId', ParseIntPipe) roomId: number,
    @Body() dto: InviteUserToRoomDto,
    @ActiveUser('sub') userId: number,
  ) {
    return this.invitationService.inviteUser(dto, roomId, userId);
  }

  @Get()
  @ApiOperation({
    summary: 'List the invitations of a room, newest first. Owner only.',
    description:
      'Filter with status=awaiting_approval to list the invitations waiting for review.',
  })
  getRoomInvitations(
    @Param('roomId', ParseIntPipe) roomId: number,
    @Query() query: ListRoomInvitationsQueryDto,
    @ActiveUser('sub') userId: number,
  ) {
    return this.invitationService.getRoomInvitations(
      { ...query, roomId },
      userId,
    );
  }
}
