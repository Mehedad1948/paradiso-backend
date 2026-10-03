import { ActiveUserData } from '../../auth/interfaces/active-user-data.interface';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigType } from '@nestjs/config';
import jwtConfig from '../../auth/config/jwt.config';
import { lockRoom } from '../../rooms/providers/room-transaction';
import { Room } from '../../rooms/room.entity';
import { Repository } from 'typeorm';
import { RoomInvitation } from '../room-invitation.entity';

interface InvitationClaims {
  tokenUse: string;
  roomId: number;
  email: string;
  invitationId: number;
  invitationVersion: string;
}
@Injectable()
export class AcceptInvitationProvider {
  constructor(
    @InjectRepository(RoomInvitation)
    private readonly invitations: Repository<RoomInvitation>,
    private readonly jwt: JwtService,
    @Inject(jwtConfig.KEY)
    private readonly config: ConfigType<typeof jwtConfig>,
  ) {}
  async accept(token: string, user: ActiveUserData) {
    let claims: InvitationClaims;
    try {
      claims = await this.jwt.verifyAsync<InvitationClaims>(token, {
        secret: this.config.secret,
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: ['HS256'],
      });
      if (
        claims.tokenUse !== 'room-invitation' ||
        !Number.isSafeInteger(claims.roomId) ||
        claims.roomId < 1 ||
        !Number.isSafeInteger(claims.invitationId) ||
        typeof claims.email !== 'string' ||
        typeof claims.invitationVersion !== 'string'
      ) {
        throw new Error('Invalid invitation claims');
      }
    } catch {
      throw new UnauthorizedException('Invalid or expired invitation');
    }
    if (
      !user?.isEmailVerified ||
      user.email?.toLowerCase().trim() !== claims.email
    ) {
      throw new ForbiddenException(
        'Sign in with the verified email address that received this invitation',
      );
    }
    return this.invitations.manager.transaction(async (manager) => {
      await lockRoom(manager, claims.roomId);
      const repo = manager.getRepository(RoomInvitation);
      const invitation = await repo.findOne({
        where: {
          id: claims.invitationId,
          room: { id: claims.roomId },
          email: claims.email,
        },
      });
      if (!invitation) throw new NotFoundException('Invitation not found');
      const joined = await manager
        .getRepository(Room)
        .exists({ where: { id: claims.roomId, users: { id: user.sub } } });
      if (invitation.status === 'accepted' && joined)
        return {
          roomId: claims.roomId,
          message: 'Invitation already accepted',
        };
      if (
        invitation.status !== 'pending' ||
        invitation.updatedAt.toISOString() !== claims.invitationVersion
      ) {
        throw new ConflictException('Invitation is no longer active');
      }
      if (!joined)
        await manager
          .createQueryBuilder()
          .relation(Room, 'users')
          .of(claims.roomId)
          .add(user.sub);
      invitation.status = 'accepted';
      await repo.save(invitation);
      return { roomId: claims.roomId, message: 'Invitation accepted' };
    });
  }
}
