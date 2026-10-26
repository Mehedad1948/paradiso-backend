import { Module } from '@nestjs/common';
import { RoomInviteLinksController } from './room-invite-links.controller';
import { UpdateRoomInviteLinkProvider } from './providers/update-room-invite-link.provider';
import { DeleteRoomInviteLinkProvider } from './providers/delete-room-invite-link.provider';
import { VerifyRoomInviteLinkProvider } from './providers/verify-room-invite-link.provider';
import { CreateRoomInviteLinkProvider } from './providers/create-room-invite-link.provider';
import { GetRoomInviteLinkProvider } from './providers/get-room-invite-link.provider';
import { RoomInviteLinksService } from './providers/room-invite-links.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoomInviteLink } from './room-invite-link.entity';
import { PaginationProvider } from '../common/pagination/providers/pagination.provider';
import { GetOneRoomInviteLinkProvider } from './providers/get-one-room-invite-token';
import { PublicInviteLinksController } from './public-invite-links.controller';
import { RoomsModule } from '../rooms/rooms.module';
import { RoomInvitationLifecycleModule } from '../room-invitations/room-invitation-lifecycle.module';

@Module({
  controllers: [RoomInviteLinksController, PublicInviteLinksController],
  providers: [
    RoomInviteLinksService,
    UpdateRoomInviteLinkProvider,
    DeleteRoomInviteLinkProvider,
    VerifyRoomInviteLinkProvider,
    CreateRoomInviteLinkProvider,
    GetRoomInviteLinkProvider,
    GetOneRoomInviteLinkProvider,
    PaginationProvider,
  ],
  imports: [
    RoomsModule,
    RoomInvitationLifecycleModule,
    TypeOrmModule.forFeature([RoomInviteLink]),
  ],
})
export class RoomInviteLinksModule {}
