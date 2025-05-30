import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from 'src/users/providers/users.service';
import { GenerateTokensProvider } from './generate-tokens.provider';

@Injectable()
export class VerifyEmailProvider {
  constructor(
    private readonly UserService: UsersService,

    private readonly generateTokensProvider: GenerateTokensProvider,
  ) {}

  async verifyCode(email: string, code: string): Promise<{ message: string }> {
    const user = await this.UserService.findOneByEmail(email);

    if (!user || !user.verificationCode || !user.verificationCodeExpiresAt) {
      throw new NotFoundException('No verification request found');
    }

    if (user.verificationCode !== code) {
      throw new BadRequestException('Invalid verification code');
    }

    if (user.verificationCodeExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Verification code expired');
    }

    user.isEmailVerified = true;
    user.verificationCode = null;
    user.verificationCodeExpiresAt = null;

    await this.UserService.updateByEmail(email, user);

    return {
      ...(await this.generateTokensProvider.generateTokens(user)),
      message: 'Email verified successfully',
    };
  }
}
