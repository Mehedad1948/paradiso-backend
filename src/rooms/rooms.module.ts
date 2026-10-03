import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PaginationModule } from '../common/pagination/dtos/pagination.module';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { CreateRoomProvider } from './providers/create-room.provider';
import { GetRoomProvider } from './providers/get-room.provider';
import { JoinRoomProvider } from './providers/join-room-provider';
import { RoomsService } from './providers/rooms.service';
import { Room } from './room.entity';
import { RoomsController } from './rooms.controller';
import { MoviesModule } from '../movies/movies.module';
import { RoomAccessService } from './providers/room-access.service';
import { RoomMemberGuard } from './guards/RoomMember/roomMember.guard';
import { AddMovieToRoomProvider } from './providers/add-movie-to-room.provider';
import { RatingsModule } from '../ratings/ratings.module';
import { DeleteMovieFromRoomProvider } from './providers/delete-movie-from-room.provider';
import { RoomReadGuard } from './guards/room-read.guard';

@Module({
  providers: [
    RoomsService,
    GetRoomProvider,
    CreateRoomProvider,
    JoinRoomProvider,
    RoomAccessService,
    RoomMemberGuard,
    RoomReadGuard,
    AddMovieToRoomProvider,
    DeleteMovieFromRoomProvider,
  ],
  exports: [RoomsService, RoomMemberGuard, RoomReadGuard, RoomAccessService],
  imports: [
    TypeOrmModule.forFeature([Room]),
    UsersModule,
    forwardRef(() => MoviesModule),
    PaginationModule,
    MailModule,
    AuthModule,
    forwardRef(() => RatingsModule),
  ],
  controllers: [RoomsController],
})
export class RoomsModule {}
