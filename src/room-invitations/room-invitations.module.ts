import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import jwtConfig from '../auth/config/jwt.config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoomsModule } from '../rooms/rooms.module';
import { Room } from '../rooms/room.entity';
import { CreateInvitationProvider } from './providers/create-invitation.provider';
import { GetRoomInvitationProvider } from './providers/get-room-invitation.provider';
import { InvitableRoomsProvider } from './providers/invitable-rooms.provider';
import { InvitationActionsProvider } from './providers/invitation-actions.provider';
import { RoomInvitationService } from './providers/invitations.service';
import { RoomInvitation } from './room-invitation.entity';
import { RoomInvitationsController } from './room-invitations.controller';
import { PaginationProvider } from '../common/pagination/providers/pagination.provider';
import { AcceptInvitationController } from './accept-invitation.controller';
import { AcceptInvitationProvider } from './providers/accept-invitation.provider';
import { RoomInvitationActionsController } from './room-invitation-actions.controller';
import { MyRoomInvitationsController } from './my-room-invitations.controller';
import { MySentRoomInvitationsController } from './my-sent-room-invitations.controller';
import { UserInvitableRoomsController } from './user-invitable-rooms.controller';
import { RoomInvitationLifecycleModule } from './room-invitation-lifecycle.module';

@Module({
  imports: [
    ConfigModule.forFeature(jwtConfig),
    RoomsModule,
    RoomInvitationLifecycleModule,
    TypeOrmModule.forFeature([RoomInvitation, Room]),
  ],
  providers: [
    RoomInvitationService,
    CreateInvitationProvider,
    InvitationActionsProvider,
    InvitableRoomsProvider,
    AcceptInvitationProvider,
    GetRoomInvitationProvider,
    PaginationProvider,
  ],
  controllers: [
    RoomInvitationsController,
    AcceptInvitationController,
    RoomInvitationActionsController,
    MyRoomInvitationsController,
    MySentRoomInvitationsController,
    UserInvitableRoomsController,
  ],
  exports: [RoomInvitationService],
})
export class RoomInvitationsModule {}
