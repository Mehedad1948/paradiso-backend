import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoomsService } from './providers/rooms.service';
import { Room } from './room.entity';
import { RoomsController } from './rooms.controller';
import { UsersModule } from 'src/users/users.module';
import { GetRoomProvider } from './providers/get-room.provider';
import { CreateRoomProvider } from './providers/create-room.provider';
import { PaginationModule } from 'src/common/pagination/dtos/pagination.module';
import { MailModule } from 'src/mail/mail.module';
import { AuthModule } from 'src/auth/auth.module';
import { JoinRoomProvider } from './providers/join-room-provider';
import { RoomInvitationsModule } from 'src/room-invitations/room-invitations.module';

@Module({
  providers: [
    RoomsService,
    GetRoomProvider,
    CreateRoomProvider,
    JoinRoomProvider,
  ],
  exports: [RoomsService],
  imports: [
    TypeOrmModule.forFeature([Room]),
    UsersModule,
    PaginationModule,
    MailModule,
    AuthModule,
    RoomInvitationsModule,
  ],
  controllers: [RoomsController],
})
export class RoomsModule {}
