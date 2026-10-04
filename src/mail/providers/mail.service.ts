import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { renderFile } from 'ejs';
import { join } from 'path';
import { User } from '../../users/user.entity';

@Injectable()
export class MailService {
  constructor(private readonly config: ConfigService) {}

  private async sendEmail(
    to: string,
    subject: string,
    template: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    const apiKey = this.config.get<string>('appConfig.brevoApiKey');
    const senderEmail = this.config.get<string>('appConfig.brevoSenderEmail');
    if (!apiKey || !senderEmail) {
      throw new Error(
        'BRAVO_API_KEY and BREVO_SENDER_EMAIL are required to send email',
      );
    }

    const htmlContent = await renderFile(
      join(__dirname, '..', 'templates', template),
      context,
    );
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Paradiso', email: senderEmail },
        to: [{ email: to }],
        subject,
        htmlContent,
      }),
    });
    if (!response.ok) {
      throw new Error(
        `Brevo email request failed with status ${response.status}`,
      );
    }
  }

  public async sendUserWelcome(user: User): Promise<void> {
    await this.sendEmail(user.email, 'Welcome to Paradiso', 'welcome.ejs', {
      name: user.username,
      email: user.email,
    });
  }

  public async sendVerificationEmail(user: User): Promise<void> {
    if (!user.verificationCode)
      throw new Error('Verification code is required');
    await this.sendEmail(
      user.email,
      'Please confirm your email',
      'verify-email.ejs',
      {
        name: user.username,
        email: user.email,
        code: user.verificationCode,
      },
    );
  }

  public async sendResetPasswordEmail(user: User): Promise<void> {
    if (!user.verificationCode)
      throw new Error('Verification code is required');
    await this.sendEmail(
      user.email,
      'Reset Your Password',
      'reset-password.ejs',
      {
        name: user.username,
        email: user.email,
        code: user.verificationCode,
      },
    );
  }

  public async sendInvitationEmail(user: {
    inviterUsername: string;
    email: string;
    invitationToken: string;
  }): Promise<{ ok: boolean; message?: string }> {
    try {
      const productBaseUrl = this.config.get<string>(
        'appConfig.productBaseUrl',
      );
      if (!productBaseUrl) throw new Error('PRODUCT_BASE_URL is required');
      const invitationUrl = `${productBaseUrl.replace(/\/$/, '')}/invitation/${encodeURIComponent(user.invitationToken)}`;
      await this.sendEmail(
        user.email,
        'You are invited to join a room',
        'invite-room-email.ejs',
        {
          inviterUsername: user.inviterUsername,
          email: user.email,
          invitationUrl,
        },
      );
      return { ok: true };
    } catch {
      throw new InternalServerErrorException('Failed to send invitation email');
    }
  }
}
