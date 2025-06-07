import { Injectable } from '@nestjs/common';
import { UsersService } from 'src/users/providers/users.service';
import { ForgetPasswordDto } from '../dtos/forget-password.dto';
import { RefreshTokenDto } from '../dtos/refresh-token.dto';
import { ResetPasswordDto } from '../dtos/reset-password.dto';
import { SignInDto } from '../dtos/signin.dto';
import { VerifyCodeDto } from '../dtos/verify-code.dto';
import { ForgetPasswordProvider } from './forget-password.provider';
import { RefreshTokensProvider } from './refresh-tokens.provider';
import { ResetPasswordProvider } from './reset-password.provider';
import { SignInProvider } from './sign-in.provider';
import { VerifyEmailProvider } from './verify-email.provider';
import { GenerateTokensProvider } from './generate-tokens.provider';
@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly resetPasswordProvider: ResetPasswordProvider,
    private readonly signInProvider: SignInProvider,
    private readonly refreshTokensProvider: RefreshTokensProvider,
    private readonly verifyEmailProvider: VerifyEmailProvider,
    private readonly forgetPasswordProvider: ForgetPasswordProvider,
    private readonly generateTokenProvider: GenerateTokensProvider,
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

  public async resetPassword(body: ResetPasswordDto) {
    return await this.resetPasswordProvider.resetPassword(body);
  }

  public async forgetPassword({ email }: ForgetPasswordDto) {
    return await this.forgetPasswordProvider.forgetPassword({ email });
  }

  public async generateInvitationToken(data: {
    inviterUsername: string;
    email: string;
    roomId: number;
  }) {
    return await this.generateTokenProvider.generateInviteToken(data);
  }
}
