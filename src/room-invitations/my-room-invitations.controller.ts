import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ActiveUser } from '../auth/decorator/active-user.decorator';
import { ListMyInvitationsQueryDto } from './dto/get-room-inviations.dto';
import { RoomInvitationService } from './providers/invitations.service';

@Controller('me/room-invitations')
export class MyRoomInvitationsController {
  constructor(private readonly invitations: RoomInvitationService) {}

  @Get()
  @ApiOperation({
    summary: 'Room invitations sent to you, newest first.',
    description:
      'Invitations still waiting for the owner, or rejected by them, are never listed. Filter with status.',
  })
  list(
    @Query() query: ListMyInvitationsQueryDto,
    @ActiveUser('sub') userId: number,
  ) {
    return this.invitations.getMyInvitations(query, userId);
  }
}
