// public-invite-links.controller.ts
import { Controller, Get, Param } from '@nestjs/common';
import { RoomInviteLinksService } from './providers/room-invite-links.service';

@Controller('invite-links')
export class PublicInviteLinksController {
  constructor(
    private readonly roomInviteLinksService: RoomInviteLinksService,
  ) {}

  @Get(':token')
  getOneByToken(@Param('token') token: string) {
    return this.roomInviteLinksService.getOne(token);
  }

  @Get(':token/verify')
  verify(@Param('token') token: string) {
    return this.roomInviteLinksService.verify(token);
  }
}
