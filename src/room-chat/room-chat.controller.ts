import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ActiveUser } from '../auth/decorator/active-user.decorator';
import { RoomMemberGuard } from '../rooms/guards/RoomMember/roomMember.guard';
import { RoomChatService } from './room-chat.service';
import {
  ChatPageDto,
  ChatPollVoteDto,
  ChatReactionDto,
  ChatReadDto,
  ChatSyncDto,
  CreateChatMessageDto,
  UpdateChatMessageDto,
} from './room-chat.dto';

// Chat is private to room members and the owner, including in public rooms.
// Mutations return the updated message so clients can replace it by id.
@Controller('rooms/:roomId/chat')
@UseGuards(RoomMemberGuard)
export class RoomChatController {
  constructor(private readonly chat: RoomChatService) {}

  @Get('messages')
  @ApiOperation({
    summary: 'Message history, newest first. Page with before=nextCursor.',
  })
  listMessages(
    @Param('roomId', ParseIntPipe) roomId: number,
    @Query() query: ChatPageDto,
    @ActiveUser('sub') userId: number,
  ) {
    return this.chat.listMessages(roomId, userId, query);
  }

  @Get('messages/sync')
  @ApiOperation({
    summary: 'Messages created or changed since a cursor, oldest change first.',
    description:
      'Poll while the chat is visible and pass back the returned cursor. Results overlap by a few seconds; replace messages by id. Call again at once while hasMore is true.',
  })
  syncMessages(
    @Param('roomId', ParseIntPipe) roomId: number,
    @Query() query: ChatSyncDto,
    @ActiveUser('sub') userId: number,
  ) {
    return this.chat.syncMessages(roomId, userId, query);
  }

  @Get('pinned')
  listPinned(
    @Param('roomId', ParseIntPipe) roomId: number,
    @ActiveUser('sub') userId: number,
  ) {
    return this.chat.listPinned(roomId, userId);
  }

  @Get('unread')
  getUnread(
    @Param('roomId', ParseIntPipe) roomId: number,
    @ActiveUser('sub') userId: number,
  ) {
    return this.chat.getUnread(roomId, userId);
  }

  @Put('read')
  markRead(
    @Param('roomId', ParseIntPipe) roomId: number,
    @Body() dto: ChatReadDto,
    @ActiveUser('sub') userId: number,
  ) {
    return this.chat.markRead(roomId, userId, dto.messageId);
  }

  @Get('messages/:messageId')
  getMessage(
    @Param('roomId', ParseIntPipe) roomId: number,
    @Param('messageId', ParseIntPipe) id: number,
    @ActiveUser('sub') userId: number,
  ) {
    return this.chat.getMessage(roomId, id, userId);
  }

  @Post('messages')
  @ApiOperation({
    summary: 'Send text, a reply, mentions, movie cards or a poll.',
  })
  sendMessage(
    @Param('roomId', ParseIntPipe) roomId: number,
    @Body() dto: CreateChatMessageDto,
    @ActiveUser('sub') userId: number,
  ) {
    return this.chat.sendMessage(roomId, userId, dto);
  }

  @Patch('messages/:messageId')
  editMessage(
    @Param('roomId', ParseIntPipe) roomId: number,
    @Param('messageId', ParseIntPipe) id: number,
    @Body() dto: UpdateChatMessageDto,
    @ActiveUser('sub') userId: number,
  ) {
    return this.chat.editMessage(roomId, id, userId, dto);
  }

  @Delete('messages/:messageId')
  @ApiOperation({
    summary: 'Delete a message. The author or the room owner may delete.',
  })
  deleteMessage(
    @Param('roomId', ParseIntPipe) roomId: number,
    @Param('messageId', ParseIntPipe) id: number,
    @ActiveUser('sub') userId: number,
  ) {
    return this.chat.deleteMessage(roomId, id, userId);
  }

  @Put('messages/:messageId/reactions')
  addReaction(
    @Param('roomId', ParseIntPipe) roomId: number,
    @Param('messageId', ParseIntPipe) id: number,
    @Body() dto: ChatReactionDto,
    @ActiveUser('sub') userId: number,
  ) {
    return this.chat.addReaction(roomId, id, userId, dto.emoji);
  }

  @Delete('messages/:messageId/reactions')
  removeReaction(
    @Param('roomId', ParseIntPipe) roomId: number,
    @Param('messageId', ParseIntPipe) id: number,
    @Body() dto: ChatReactionDto,
    @ActiveUser('sub') userId: number,
  ) {
    return this.chat.removeReaction(roomId, id, userId, dto.emoji);
  }

  @Put('messages/:messageId/poll/vote')
  votePoll(
    @Param('roomId', ParseIntPipe) roomId: number,
    @Param('messageId', ParseIntPipe) id: number,
    @Body() dto: ChatPollVoteDto,
    @ActiveUser('sub') userId: number,
  ) {
    return this.chat.vote(roomId, id, userId, dto);
  }

  @Post('messages/:messageId/poll/close')
  @HttpCode(200)
  closePoll(
    @Param('roomId', ParseIntPipe) roomId: number,
    @Param('messageId', ParseIntPipe) id: number,
    @ActiveUser('sub') userId: number,
  ) {
    return this.chat.closePoll(roomId, id, userId);
  }

  @Put('messages/:messageId/pin')
  pinMessage(
    @Param('roomId', ParseIntPipe) roomId: number,
    @Param('messageId', ParseIntPipe) id: number,
    @ActiveUser('sub') userId: number,
  ) {
    return this.chat.setPinned(roomId, id, userId, true);
  }

  @Delete('messages/:messageId/pin')
  unpinMessage(
    @Param('roomId', ParseIntPipe) roomId: number,
    @Param('messageId', ParseIntPipe) id: number,
    @ActiveUser('sub') userId: number,
  ) {
    return this.chat.setPinned(roomId, id, userId, false);
  }
}
