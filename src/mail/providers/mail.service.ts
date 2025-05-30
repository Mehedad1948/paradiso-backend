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
        loginUrl: 'http://localhost:3000',
      },
    });
  }

  public async sendVerificationEmail(user: User): Promise<void> {
    const verificationUrl = `http://localhost:3000/verify-email?code=${user.verificationCode}`;

    await this.mailerService.sendMail({
      to: user.email,
      from: `Verify Your Email <no-reply@nestjs-blog.com>`,
      subject: 'Please confirm your email',
      template: './verify-email', // views/verify-email.hbs
      context: {
        name: user.username,
        email: user.email,
        verificationUrl,
      },
    });
  }
}
