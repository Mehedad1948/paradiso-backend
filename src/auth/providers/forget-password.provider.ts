import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from 'src/users/providers/users.service';
import { GenerateTokensProvider } from './generate-tokens.provider';
import { ResetPasswordDto } from '../dtos/reset-password.dto';
import { HashingProvider } from './hashing.provider';
import { ForgetPasswordDto } from '../dtos/forget-password.dto';
import { MailService } from 'src/mail/providers/mail.service';

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
