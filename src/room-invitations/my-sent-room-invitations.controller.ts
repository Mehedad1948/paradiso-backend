import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ActiveUser } from '../auth/decorator/active-user.decorator';
import { ListSentInvitationsQueryDto } from './dto/get-room-inviations.dto';
import { RoomInvitationService } from './providers/invitations.service';

@Controller('me/sent-room-invitations')
export class MySentRoomInvitationsController {
  constructor(private readonly invitations: RoomInvitationService) {}

  @Get()
  @ApiOperation({
    summary: 'Room invitations you sent, newest first.',
    description:
      'Every room and every status, including invitations awaiting approval or rejected by the owner. summary counts all of your sent invitations regardless of status and page. Cancel an open one with DELETE /room-invitations/{id}.',
  })
  list(
    @Query() query: ListSentInvitationsQueryDto,
    @ActiveUser('sub') userId: number,
  ) {
    return this.invitations.getSentInvitations(query, userId);
  }
}
