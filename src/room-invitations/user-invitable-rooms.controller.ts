import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ActiveUser } from '../auth/decorator/active-user.decorator';
import { RoomInvitationService } from './providers/invitations.service';

@Controller('users/:userId/invitable-rooms')
export class UserInvitableRoomsController {
  constructor(private readonly invitations: RoomInvitationService) {}

  @Get()
  @ApiOperation({
    summary: 'Your rooms, annotated for inviting this user from their profile.',
    description:
      'isMember: they are already in the room. hasPendingInvite: an open invitation exists for them. requiresApproval: your invitation would wait for the owner.',
  })
  list(
    @Param('userId', ParseIntPipe) targetUserId: number,
    @ActiveUser('sub') userId: number,
  ) {
    return this.invitations.listInvitableRooms(targetUserId, userId);
  }
}
