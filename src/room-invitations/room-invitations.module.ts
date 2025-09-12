import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { MailModule } from 'src/mail/mail.module';
import { RoomsModule } from 'src/rooms/rooms.module';
import { UsersModule } from 'src/users/users.module';
import { AddUserToRoomProvider } from './providers/add-user-to-room.provider';
import { GetRoomInvitationProvider } from './providers/get-room-invitation.provider';
import { RoomInvitationService } from './providers/invitations.service';
import { RoomInvitation } from './room-invitation.entity';
import { RoomInvitationsController } from './room-invitations.controller';
import { PaginationProvider } from 'src/common/pagination/providers/pagination.provider';

@Module({
  imports: [
    RoomsModule,
    AuthModule,
    UsersModule,
    MailModule,
    TypeOrmModule.forFeature([RoomInvitation]),
  ],
  providers: [
    RoomInvitationService,
    AddUserToRoomProvider,
    GetRoomInvitationProvider,
    PaginationProvider,
  ],
  controllers: [RoomInvitationsController],
  exports: [RoomInvitationService],
})
export class RoomInvitationsModule {}
