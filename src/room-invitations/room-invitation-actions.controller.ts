import {
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ActiveUser } from '../auth/decorator/active-user.decorator';
import { RoomInvitationService } from './providers/invitations.service';

// Each action returns the updated invitation. Token-based acceptance for email
// links stays on POST /room-invitations/accept.
@Controller('room-invitations')
export class RoomInvitationActionsController {
  constructor(private readonly invitations: RoomInvitationService) {}

  @Post(':id/accept')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Accept a pending invitation and join the room. Invitee only.',
  })
  accept(
    @Param('id', ParseIntPipe) id: number,
    @ActiveUser('sub') userId: number,
  ) {
    return this.invitations.accept(id, userId);
  }

  @Post(':id/decline')
  @HttpCode(200)
  @ApiOperation({ summary: 'Decline a pending invitation. Invitee only.' })
  decline(
    @Param('id', ParseIntPipe) id: number,
    @ActiveUser('sub') userId: number,
  ) {
    return this.invitations.decline(id, userId);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Approve an invitation awaiting approval, making it pending. Room owner only.',
  })
  approve(
    @Param('id', ParseIntPipe) id: number,
    @ActiveUser('sub') userId: number,
  ) {
    return this.invitations.approve(id, userId);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reject an invitation awaiting approval. Room owner only.',
  })
  reject(
    @Param('id', ParseIntPipe) id: number,
    @ActiveUser('sub') userId: number,
  ) {
    return this.invitations.reject(id, userId);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Cancel an invitation you sent. Sets its status to cancelled.',
  })
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @ActiveUser('sub') userId: number,
  ) {
    return this.invitations.cancel(id, userId);
  }
}
