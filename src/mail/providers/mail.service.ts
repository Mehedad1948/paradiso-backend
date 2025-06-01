import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';
import { User } from 'src/users/user.entity';

@Injectable()
export class MailService {
  constructor(private mailerService: MailerService) {}

  public async sendUserWelcome(user: User): Promise<void> {
    await this.mailerService.sendMail({
      to: user.email,
      from: `Onboarding Team <support@nestjs-blog.com>`,
      template: './welcome', // views/welcome.hbs (or ejs/pug depending on your config)
      context: {
        name: user.username,
        email: user.email,
        code: user.verificationCode,
        loginUrl: 'http://localhost:3000',
      },
    });
  }

  public async sendVerificationEmail(user: User): Promise<void> {
    const verificationUrl = `http://localhost:3001/auth/verify-email?code=${user.verificationCode}`;

    await this.mailerService.sendMail({
      to: user.email,
      from: `Verify Your Email <no-reply@nestjs-blog.com>`,
      subject: 'Please confirm your email',
      template: './verify-email.ejs', // views/verify-email.hbs
      context: {
        name: user.username,
        email: user.email,
        code: user.verificationCode,
        verificationUrl,
      },
    });
  }
  public async sendResetPasswordEmail(user: User): Promise<void> {
    const resetPasswordUrl = `http://localhost:3001/auth/reset-password?code=${user.verificationCode}&email=${user.email}`;

    await this.mailerService.sendMail({
      to: user.email,
      from: `Reset Your Password <no-reply@nestjs-blog.com>`,
      subject: 'Reset Your Password',
      template: './reset-password.ejs', // views/reset-password.hbs
      context: {
        name: user.username,
        email: user.email,
        code: user.verificationCode,
        resetPasswordUrl,
      },
    });
  }
}
