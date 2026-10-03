import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import jwtConfig from '../config/jwt.config';
import { ConfigType } from '@nestjs/config';
import { User } from '../../users/user.entity';
import { ActiveUserData } from '../interfaces/active-user-data.interface';

@Injectable()
export class GenerateTokensProvider {
  constructor(
    private readonly jwtService: JwtService,

    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) {}

  public async signToken<T>(expiresIn: number, payload?: T) {
    return await this.jwtService.signAsync(
      {
        ...payload,
      },
      {
        secret: this.jwtConfiguration.secret,
        issuer: this.jwtConfiguration.issuer,
        audience: this.jwtConfiguration.audience,
        expiresIn,
      },
    );
  }

  public async generateTokens(user: User) {
    const [accessToken, refreshToken] = await Promise.all([
      this.signToken<Partial<ActiveUserData>>(
        this.jwtConfiguration.accessTokenTtl,
        {
          sub: user.id,
          tokenUse: 'access',
          email: user.email,
          role: user.role?.name,
          isEmailVerified: user.isEmailVerified,
        },
      ),
      this.signToken(this.jwtConfiguration.refreshTokenTtl, {
        sub: user.id,
        tokenUse: 'refresh',
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  public async generateInviteToken({
    inviterUsername,
    email,
    roomId,
    invitationId,
    invitationVersion,
  }: {
    inviterUsername: string;
    email: string;
    roomId: number;
    invitationId: number;
    invitationVersion: string;
  }) {
    const inviteToken = await this.signToken(
      this.jwtConfiguration.invitationTokenTtl,
      {
        email: email,
        roomId,
        invitationId,
        invitationVersion,
        tokenUse: 'room-invitation',
        inviterUsername: inviterUsername,
        expiresAt: new Date(
          new Date().getTime() +
            this.jwtConfiguration.invitationTokenTtl * 1000,
        ).toLocaleDateString(),
      },
    );

    return {
      inviteToken,
    };
  }
}
