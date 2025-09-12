import { Module } from '@nestjs/common';
import { RoomInviteLinksService } from './room-invite-links.service';
import { RoomInviteLinksController } from './room-invite-links.controller';

@Module({
  controllers: [RoomInviteLinksController],
  providers: [RoomInviteLinksService],
})
export class RoomInviteLinksModule {}
