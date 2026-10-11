import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MailService } from '../../mail/providers/mail.service';
import { UsersService } from '../../users/providers/users.service';
import { GenerateTokensProvider } from './generate-tokens.provider';

@Injectable()
export class VerifyEmailProvider {
  constructor(
    private readonly UserService: UsersService,

    private readonly generateTokensProvider: GenerateTokensProvider,

    private readonly mailService: MailService,
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

    await this.UserService.updateByEmail(user.email, user);

    return {
      ...(await this.generateTokensProvider.generateTokens(user)),
      message: 'Email verified successfully',
    };
  }

  async resendCode(email: string): Promise<{ message: string }> {
    const user = await this.UserService.findOneByEmail(email);

    if (!user) {
      throw new NotFoundException('No user found');
    }
    if (user.isEmailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    user.verificationCode = Math.floor(1000 + Math.random() * 9000).toString();
    user.verificationCodeExpiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.UserService.updateByEmail(user.email, user);
    await this.mailService.sendVerificationEmail(user);

    return { message: 'Check your email for the verification code' };
  }
}
