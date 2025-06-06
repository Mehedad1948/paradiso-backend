import { Injectable, NotFoundException } from '@nestjs/common';
import { MailService } from 'src/mail/providers/mail.service';
import { UsersService } from 'src/users/providers/users.service';
import { ForgetPasswordDto } from '../dtos/forget-password.dto';
import { GenerateTokensProvider } from './generate-tokens.provider';

@Injectable()
export class ForgetPasswordProvider {
  constructor(
    private readonly UserService: UsersService,

    private readonly generateTokensProvider: GenerateTokensProvider,

    private readonly mailService: MailService,
  ) {}

  async forgetPassword({
    email,
  }: ForgetPasswordDto): Promise<{ message: string }> {
    const user = await this.UserService.findOneByEmail(email);

    if (!user) {
      throw new NotFoundException('No user found');
    }
    if (!user.isEmailVerified) {
      throw new NotFoundException("User's email is not  verified");
    }
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000);

    user.verificationCode = code;
    user.verificationCodeExpiresAt = expiresAt;
    try {
      await this.UserService.updateByEmail(email, user);
      await this.mailService.sendResetPasswordEmail(user);

      return {
        message: 'Check your email for the password reset link',
      };
    } catch (error) {
      throw new NotFoundException('Failed to process password reset request', {
        description: error?.message,
      });
    }
  }
}
