import {
  forwardRef,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { RefreshTokenDto } from '../dtos/refresh-token.dto';
import jwtConfig from '../config/jwt.config';
import { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { GenerateTokensProvider } from './generate-tokens.provider';
import { UsersService } from '../../users/providers/users.service';

@Injectable()
export class RefreshTokensProvider {
  constructor(
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,

    private readonly generateTokensProvider: GenerateTokensProvider,

    private readonly jwtService: JwtService,

    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) {}
  public async refreshToken(refreshTokenDto: RefreshTokenDto) {
    //  Verify Refresh token
    try {
      const { sub, tokenUse } = await this.jwtService.verifyAsync<{
        sub: number;
        tokenUse: string;
      }>(refreshTokenDto.refreshToken, {
        secret: this.jwtConfiguration.secret,
        audience: this.jwtConfiguration.audience,
        issuer: this.jwtConfiguration.issuer,
        algorithms: ['HS256'],
      });
      if (tokenUse !== 'refresh' || !Number.isSafeInteger(sub) || sub < 1)
        throw new UnauthorizedException();
      //  Fetch user from database
      const user = await this.usersService.findOneById(sub);
      // Generate Token
      return await this.generateTokensProvider.generateTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}
