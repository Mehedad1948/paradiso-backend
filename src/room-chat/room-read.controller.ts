import {
  Controller,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ActiveUser } from '../auth/decorator/active-user.decorator';
import { RoomMemberGuard } from '../rooms/guards/RoomMember/roomMember.guard';
import { RoomChatService } from './room-chat.service';

// Lives beside the rooms routes so list views can clear a room's badge
// without knowing the newest message ID.
@Controller('rooms')
@UseGuards(RoomMemberGuard)
export class RoomReadController {
  constructor(private readonly chat: RoomChatService) {}

  @Post(':roomId/read')
  @HttpCode(200)
  @ApiOperation({
    summary: "Mark the room's chat read up to its latest message.",
  })
  markRead(
    @Param('roomId', ParseIntPipe) roomId: number,
    @ActiveUser('sub') userId: number,
  ) {
    return this.chat.markLatestRead(roomId, userId);
  }
}
