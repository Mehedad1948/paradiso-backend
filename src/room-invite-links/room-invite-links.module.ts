import { Module } from '@nestjs/common';
import { RoomInviteLinksService } from './room-invite-links.service';
import { RoomInviteLinksController } from './room-invite-links.controller';
import { UpdateRoomInviteLinkProvider } from './providers/update-room-invite-link.provider';
import { DeleteRoomInviteLinkProvider } from './providers/delete-room-invite-link.provider';
import { VerifyRoomInviteLinkProvider } from './providers/verify-room-invite-link.provider';
import { CreateRoomInviteLinkProvider } from './providers/create-room-invite-link.provider';
import { GetRoomInviteLinkProvider } from './providers/get-room-invite-link.provider';

@Module({
  controllers: [RoomInviteLinksController],
  providers: [
    RoomInviteLinksService,
    UpdateRoomInviteLinkProvider,
    DeleteRoomInviteLinkProvider,
    VerifyRoomInviteLinkProvider,
    CreateRoomInviteLinkProvider,
    GetRoomInviteLinkProvider,
  ],
})
export class RoomInviteLinksModule {}
