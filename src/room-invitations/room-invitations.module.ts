import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { MailModule } from 'src/mail/mail.module';
import { RoomsModule } from 'src/rooms/rooms.module';
import { UsersModule } from 'src/users/users.module';
import { RoomInvitationService } from './providers/invitations.service';
import { RoomInvitationsController } from './room-invitations.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoomInvitation } from './room-invitation.entity';
import { GetRoomInvitationProvider } from './providers/get-room-invitation.provider';
import { AddUserToRoomProvider } from './providers/add-user-to-room.provider';

@Module({
  imports: [
    forwardRef(() => RoomsModule),
    AuthModule,
    UsersModule,
    MailModule,
    TypeOrmModule.forFeature([RoomInvitation]),
  ],
  providers: [
    RoomInvitationService,
    AddUserToRoomProvider,
    GetRoomInvitationProvider,
  ],
  controllers: [RoomInvitationsController],
  exports: [RoomInvitationService],
})
export class RoomInvitationsModule {}
