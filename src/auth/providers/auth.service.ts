import { Injectable } from '@nestjs/common';
import { SignInDto } from '../dtos/signin.dto';
import { HashingProvider } from './hashing.provider';
import { SignInProvider } from './sign-in.provider';
import { RefreshTokenDto } from '../dtos/refresh-token.dto';
import { RefreshTokensProvider } from './refresh-tokens.provider';
import { UsersService } from 'src/users/providers/users.service';
@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly hashingProvider: HashingProvider,
    private readonly signInProvider: SignInProvider,
    private readonly refreshTokensProvider: RefreshTokensProvider,
  ) {}
  public async signIn(signInDto: SignInDto) {
    return this.signInProvider.signIn(signInDto);
  }
  public async refreshTokens(refreshTokenDto: RefreshTokenDto) {
    return this.refreshTokensProvider.refreshToken(refreshTokenDto);
  }
}
