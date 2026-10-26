import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MoviesModule } from '../movies/movies.module';
import { RoomsModule } from '../rooms/rooms.module';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  RoomChatRead,
  RoomMessage,
  RoomMessageMention,
  RoomMessageMovie,
  RoomMessageReaction,
} from './room-message.entity';
import { RoomPoll, RoomPollOption, RoomPollVote } from './room-poll.entity';
import { RoomChatController } from './room-chat.controller';
import { RoomReadController } from './room-read.controller';
import { RoomChatService } from './room-chat.service';

@Module({
  imports: [
    RoomsModule,
    MoviesModule,
    NotificationsModule,
    TypeOrmModule.forFeature([
      RoomMessage,
      RoomMessageMention,
      RoomMessageMovie,
      RoomMessageReaction,
      RoomChatRead,
      RoomPoll,
      RoomPollOption,
      RoomPollVote,
    ]),
  ],
  controllers: [RoomChatController, RoomReadController],
  providers: [RoomChatService],
})
export class RoomChatModule {}
