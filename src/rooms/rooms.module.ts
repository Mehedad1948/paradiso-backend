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
import { AddUserToRoomProvider } from './providers/add-user-to-room.provider';

@Module({
  providers: [
    RoomsService,
    GetRoomProvider,
    CreateRoomProvider,
    AddUserToRoomProvider,
  ],
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
