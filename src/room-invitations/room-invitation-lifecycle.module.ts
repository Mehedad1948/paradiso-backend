import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { InvitationLifecycleService } from './invitation-lifecycle.service';
import { RoomInvitation } from './room-invitation.entity';

// Split from RoomInvitationsModule so rooms and invite links can call into it
// without a module cycle.
@Module({
  imports: [
    TypeOrmModule.forFeature([RoomInvitation]),
    NotificationsModule,
    AuthModule,
  ],
  providers: [InvitationLifecycleService],
  exports: [InvitationLifecycleService],
})
export class RoomInvitationLifecycleModule {}
