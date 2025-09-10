import { forwardRef, Module } from '@nestjs/common';
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
import { MoviesModule } from 'src/movies/movies.module';
import { RoomAccessService } from './providers/room-access.service';
import { RoomMemberGuard } from './guards/RoomMember/roomMember.guard';
import { AddMovieToRoomProvider } from './providers/add-movie-to-room.provider';
import { RatingsModule } from 'src/ratings/ratings.module';
import { DeleteMovieFromRoomProvider } from './providers/delete-movie-from-room.provider';

@Module({
  providers: [
    RoomsService,
    GetRoomProvider,
    CreateRoomProvider,
    JoinRoomProvider,
    RoomAccessService,
    RoomMemberGuard,
    AddMovieToRoomProvider,
    DeleteMovieFromRoomProvider,
  ],
  exports: [RoomsService, RoomMemberGuard, RoomAccessService],
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
