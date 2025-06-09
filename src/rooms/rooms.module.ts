import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { PaginationModule } from 'src/common/pagination/dtos/pagination.module';
import { MailModule } from 'src/mail/mail.module';
import { UsersModule } from 'src/users/users.module';
import { CreateRoomProvider } from './providers/create-room.provider';
import { GetRoomProvider } from './providers/get-room.provider';
import { JoinRoomProvider } from './providers/join-room-provider';
import { RoomsService } from './providers/rooms.service';
import { Room } from './room.entity';
import { RoomsController } from './rooms.controller';

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
  ],
  controllers: [RoomsController],
})
export class RoomsModule {}
