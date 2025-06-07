import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import jwtConfig from '../config/jwt.config';
import { ConfigType } from '@nestjs/config';
import { User } from 'src/users/user.entity';
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
          email: user.email,
          role: user.role?.name,
          isEmailVerified: user.isEmailVerified,
        },
      ),
      this.signToken(this.jwtConfiguration.refreshTokenTtl, {
        sub: user.id,
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
  }: {
    inviterUsername: string;
    email: string;
    roomId: number;
  }) {
    const inviteToken = await this.signToken(
      this.jwtConfiguration.invitationTokenTtl,
      {
        email: email,
        roomId,
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
