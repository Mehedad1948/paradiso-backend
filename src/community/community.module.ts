import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Movie } from '../movies/movie.entity';
import { Room } from '../rooms/room.entity';
import { User } from '../users/user.entity';
import { RoomInviteLink } from '../room-invite-links/room-invite-link.entity';
import { RoomsModule } from '../rooms/rooms.module';
import { CommunityPost } from './community-post.entity';
import { CommunityComment } from './community-comment.entity';
import { UserFollow } from './user-follow.entity';
import { CommunityService } from './community.service';
import { CommunityController } from './community.controller';

@Module({
  imports: [
    RoomsModule,
    TypeOrmModule.forFeature([
      CommunityPost,
      CommunityComment,
      UserFollow,
      User,
      Movie,
      Room,
      RoomInviteLink,
    ]),
  ],
  controllers: [CommunityController],
  providers: [CommunityService],
})
export class CommunityModule {}
