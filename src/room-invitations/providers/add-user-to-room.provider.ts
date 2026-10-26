import { AuthenticatedRequest } from '../../auth/interfaces/authenticated-request.interface';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { REQUEST_USER_KEY } from '../../auth/constants/auth.constants';
import { AuthService } from '../../auth/providers/auth.service';
import { MailService } from '../../mail/providers/mail.service';
import { Room } from '../../rooms/room.entity';
import { assertNotBanned } from '../../rooms/providers/room-moderation.provider';
import { lockRoom } from '../../rooms/providers/room-transaction';
import { UsersService } from '../../users/providers/users.service';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { InviteUserToRoomDto } from '../dto/invite-user-to-room.dto';
import { RoomInvitation } from '../room-invitation.entity';
import { NotificationsService } from '../../notifications/notifications.service';

@Injectable()
export class AddUserToRoomProvider {
  constructor(
    @Inject(REQUEST) private readonly request: AuthenticatedRequest,
    private readonly authService: AuthService,
    private readonly userService: UsersService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
    @InjectRepository(RoomInvitation)
    private readonly roomInvitationRepository: Repository<RoomInvitation>,
    private readonly notifications: NotificationsService,
  ) {}

  async inviteUserToRoom(dto: InviteUserToRoomDto, roomId: number) {
    const userId = this.request[REQUEST_USER_KEY]?.sub;
    if (!userId) throw new UnauthorizedException();
    const email = dto.email.trim().toLowerCase();
    const invitedUser = await this.userService.findOneByEmail(email);
    const invitingUser = await this.userService.findOneById(userId);
    const saved = await this.roomInvitationRepository.manager.transaction(
      async (manager) => {
        await lockRoom(manager, roomId);
        const room = await manager
          .getRepository(Room)
          .findOne({ where: { id: roomId }, relations: ['owner'] });
        if (room?.owner?.id !== userId)
          throw new ForbiddenException('Only the room owner can invite users');
        if (
          invitedUser &&
          (await manager
            .getRepository(Room)
            .exists({ where: { id: roomId, users: { id: invitedUser.id } } }))
        ) {
          throw new ConflictException('User is already a room member');
        }
        if (invitedUser) await assertNotBanned(manager, roomId, invitedUser.id);
        const repo = manager.getRepository(RoomInvitation);
        const existing = await repo.findOne({
          where: { email, room: { id: roomId } },
        });
        const ttl = this.config.get<number>('jwt.invitationTokenTtl') ?? 3600;
        const pendingActive =
          existing?.status === 'pending' &&
          Date.now() - existing.updatedAt.valueOf() < ttl * 1000;
        if (existing && (pendingActive || existing.status === 'accepted')) {
          throw new ConflictException(
            'An active invitation for this email already exists',
          );
        }
        const record = existing ?? repo.create({ email, room: { id: roomId } });
        record.invitedBy = invitingUser;
        record.status = 'pending';
        record.updatedAt = new Date();
        record.userStatus = invitedUser
          ? invitedUser.isEmailVerified
            ? 'member'
            : 'notVerified'
          : 'guest';
        return { invitation: await repo.save(record), room };
      },
    );
    const { invitation, room } = saved;
    let token: string;
    try {
      const { inviteToken } = await this.authService.generateInvitationToken({
        inviterUsername: invitingUser.username,
        email,
        roomId,
        invitationId: invitation.id,
        invitationVersion: invitation.updatedAt.toISOString(),
      });
      await this.mailService.sendInvitationEmail({
        inviterUsername: invitingUser.username,
        email,
        invitationToken: inviteToken,
      });
      token = inviteToken;
    } catch {
      // Failed deliveries can be retried; never leave a permanently blocking pending row.
      await this.roomInvitationRepository.update(
        {
          id: invitation.id,
          status: 'pending',
          updatedAt: invitation.updatedAt,
        },
        { status: 'expired' },
      );
      throw new ServiceUnavailableException(
        'Invitation email could not be sent. Please retry.',
      );
    }
    // Existing accounts also get it in the bell. The token lets them accept
    // in-app; accepting still requires their verified email. A re-invite
    // refreshes the unread notification instead of adding a second one.
    if (invitedUser)
      await this.notifications.notify({
        type: 'room_invite',
        recipientId: invitedUser.id,
        actorId: userId,
        entityType: 'room',
        entityId: roomId,
        roomId,
        groupKey: `room_invite:${roomId}`,
        data: {
          roomName: room.name,
          roomImage: room.image ?? null,
          inviteToken: token,
        },
      });
    return { message: 'Invitation email sent successfully', id: invitation.id };
  }
}
