// public-invite-links.controller.ts
import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Auth } from '../auth/decorator/auth.decorator';
import { AuthType } from '../auth/enums/auth.decorator';
import { RoomInviteLinksService } from './providers/room-invite-links.service';

@Controller('invite-links')
export class PublicInviteLinksController {
  constructor(
    private readonly roomInviteLinksService: RoomInviteLinksService,
  ) {}

  @Get(':token')
  @Auth(AuthType.none)
  getOneByToken(@Param('token', ParseUUIDPipe) token: string) {
    return this.roomInviteLinksService.getOne(token);
  }

  @Post('verify/:token')
  @Auth(AuthType.Bearer)
  verify(@Param('token', ParseUUIDPipe) token: string) {
    return this.roomInviteLinksService.verify(token);
  }
}
