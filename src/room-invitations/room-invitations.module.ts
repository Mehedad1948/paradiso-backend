import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { MailModule } from 'src/mail/mail.module';
import { RoomsModule } from 'src/rooms/rooms.module';
import { UsersModule } from 'src/users/users.module';
import { AddUserToRoomProvider } from './providers/add-user-to-room.provider';
import { RoomInvitationService } from './providers/invitations.service';
import { RoomInvitationsController } from './room-invitations.controller';

@Module({
  imports: [RoomsModule, AuthModule, UsersModule, MailModule],
  providers: [RoomInvitationService, AddUserToRoomProvider],
  controllers: [RoomInvitationsController],
})
export class RoomInvitationsModule {}
