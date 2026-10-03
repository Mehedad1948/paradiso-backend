import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { ActiveUserData } from '../../interfaces/active-user-data.interface';
import { AuthenticatedRequest } from '../../interfaces/authenticated-request.interface';
import { REQUEST_USER_KEY } from '../../constants/auth.constants';
import jwtConfig from '../../config/jwt.config';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(jwtConfig.KEY)
    private readonly configService: ConfigType<typeof jwtConfig>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException();
    }
    try {
      const payload = await this.jwtService.verifyAsync<ActiveUserData>(token, {
        secret: this.configService.secret,
        issuer: this.configService.issuer,
        audience: this.configService.audience,
        algorithms: ['HS256'],
      });
      if (
        payload.tokenUse !== 'access' ||
        !Number.isSafeInteger(payload.sub) ||
        payload.sub < 1
      ) {
        throw new UnauthorizedException();
      }
      request[REQUEST_USER_KEY] = payload;
    } catch {
      throw new UnauthorizedException();
    }
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
