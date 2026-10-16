import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MoviesModule } from '../movies/movies.module';
import { RoomsModule } from '../rooms/rooms.module';
import {
  RoomChatRead,
  RoomMessage,
  RoomMessageMention,
  RoomMessageMovie,
  RoomMessageReaction,
} from './room-message.entity';
import { RoomPoll, RoomPollOption, RoomPollVote } from './room-poll.entity';
import { RoomChatController } from './room-chat.controller';
import { RoomChatService } from './room-chat.service';

@Module({
  imports: [
    RoomsModule,
    MoviesModule,
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
  controllers: [RoomChatController],
  providers: [RoomChatService],
})
export class RoomChatModule {}
