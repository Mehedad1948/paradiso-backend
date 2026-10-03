import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { PaginationQueryDto } from '../common/pagination/dtos/pagination-query.dto';
import { RoomInvitationService } from './providers/invitations.service';
import { InviteUserToRoomDto } from './dto/invite-user-to-room.dto';

@Controller('rooms/:roomId/invitations')
export class RoomInvitationsController {
  constructor(private readonly invitationService: RoomInvitationService) {}

  @Post()
  async inviteUser(
    @Param('roomId', ParseIntPipe) roomId: number,
    @Body() inviteUserToRoomDto: InviteUserToRoomDto,
  ) {
    return this.invitationService.inviteUser(inviteUserToRoomDto, roomId);
  }

  @Get()
  async getRoomInvitations(
    @Param('roomId', ParseIntPipe) roomId: number,
    @Query() query: PaginationQueryDto,
  ) {
    return this.invitationService.getRoomInvitations({ ...query, roomId });
  }
}
