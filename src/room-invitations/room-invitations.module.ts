import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import jwtConfig from '../auth/config/jwt.config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { RoomsModule } from '../rooms/rooms.module';
import { UsersModule } from '../users/users.module';
import { AddUserToRoomProvider } from './providers/add-user-to-room.provider';
import { GetRoomInvitationProvider } from './providers/get-room-invitation.provider';
import { RoomInvitationService } from './providers/invitations.service';
import { RoomInvitation } from './room-invitation.entity';
import { RoomInvitationsController } from './room-invitations.controller';
import { PaginationProvider } from '../common/pagination/providers/pagination.provider';
import { AcceptInvitationController } from './accept-invitation.controller';
import { AcceptInvitationProvider } from './providers/accept-invitation.provider';

@Module({
  imports: [
    ConfigModule.forFeature(jwtConfig),
    RoomsModule,
    AuthModule,
    UsersModule,
    MailModule,
    TypeOrmModule.forFeature([RoomInvitation]),
  ],
  providers: [
    RoomInvitationService,
    AcceptInvitationProvider,
    AddUserToRoomProvider,
    GetRoomInvitationProvider,
    PaginationProvider,
  ],
  controllers: [RoomInvitationsController, AcceptInvitationController],
  exports: [RoomInvitationService],
})
export class RoomInvitationsModule {}
