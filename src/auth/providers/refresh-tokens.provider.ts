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
import { ActiveUserData } from '../interfaces/active-user-data.interface';
import { UsersService } from 'src/users/providers/users.service';

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
      const { sub } = await this.jwtService.verifyAsync<
        Pick<ActiveUserData, 'sub'>
      >(refreshTokenDto.refreshToken, {
        secret: this.jwtConfiguration.secret,
        audience: this.jwtConfiguration.audience,
        issuer: this.jwtConfiguration.issuer,
      });
      //  Fetch user from database
      const user = await this.usersService.findOneById(sub);
      // Generate Token
      return await this.generateTokensProvider.generateTokens(user);
    } catch (err) {
      throw new UnauthorizedException(err);
    }
  }
}
