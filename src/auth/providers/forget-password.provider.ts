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
    user.verificationCode = code;
    await this.mailService.sendResetPasswordEmail(user);

    return {
      message: 'Check your email for the password reset link',
    };
  }
}
