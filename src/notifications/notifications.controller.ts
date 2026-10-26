import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ActiveUser } from '../auth/decorator/active-user.decorator';
import { Auth } from '../auth/decorator/auth.decorator';
import { AuthType } from '../auth/enums/auth.decorator';
import {
  ListNotificationsDto,
  MarkNotificationsReadDto,
} from './notifications.dto';
import { NotificationsService } from './notifications.service';

// The bell in the web header. Notifications are created by the server as a
// side effect of other actions; there is no endpoint to create one.
@Controller('notifications')
@Auth(AuthType.Bearer)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'Notifications, most recently active first.',
    description:
      'Page with cursor=nextCursor. Grouped likes and comments move to the top when someone else joins in.',
  })
  list(
    @Query() query: ListNotificationsDto,
    @ActiveUser('sub') userId: number,
  ) {
    return this.notifications.list(userId, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Unread notification count for the bell badge.' })
  unreadCount(@ActiveUser('sub') userId: number) {
    return this.notifications.unreadCount(userId);
  }

  @Post('read')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Mark notifications read, by ids or all at once.',
  })
  markRead(
    @Body() dto: MarkNotificationsReadDto,
    @ActiveUser('sub') userId: number,
  ) {
    return this.notifications.markRead(userId, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @ActiveUser('sub') userId: number,
  ) {
    return this.notifications.remove(userId, id);
  }
}
