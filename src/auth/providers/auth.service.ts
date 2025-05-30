import { Injectable } from '@nestjs/common';
import { UsersService } from 'src/users/providers/users.service';
import { RefreshTokenDto } from '../dtos/refresh-token.dto';
import { SignInDto } from '../dtos/signin.dto';
import { VerifyCodeDto } from '../dtos/verify-code.dto';
import { HashingProvider } from './hashing.provider';
import { RefreshTokensProvider } from './refresh-tokens.provider';
import { SignInProvider } from './sign-in.provider';
import { VerifyEmailProvider } from './verify-email.provider';
@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly hashingProvider: HashingProvider,
    private readonly signInProvider: SignInProvider,
    private readonly refreshTokensProvider: RefreshTokensProvider,
    private readonly verifyEmailProvider: VerifyEmailProvider,
  ) {}
  public async signIn(signInDto: SignInDto) {
    return this.signInProvider.signIn(signInDto);
  }
  public async refreshTokens(refreshTokenDto: RefreshTokenDto) {
    return this.refreshTokensProvider.refreshToken(refreshTokenDto);
  }
  public async verifyEmail({ email, code }: VerifyCodeDto) {
    return await this.verifyEmailProvider.verifyCode(email, code);
  }
}
