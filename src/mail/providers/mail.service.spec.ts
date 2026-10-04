import { ConfigService } from '@nestjs/config';
import { User } from '../../users/user.entity';
import { MailService } from './mail.service';

describe('MailService Brevo delivery', () => {
  const fetchMock = jest.fn();
  const config = {
    get: jest.fn(
      (key: string) =>
        ({
          'appConfig.brevoApiKey': 'test-api-key',
          'appConfig.brevoSenderEmail': 'verified@example.test',
          'appConfig.productBaseUrl': 'https://paradiso.example.test',
        })[key],
    ),
  };
  const user = {
    email: 'recipient@example.test',
    username: 'Alex',
    verificationCode: '1234',
  } as User;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock.mockResolvedValue({ ok: true, status: 201 });
  });

  it.each([
    [
      'verification',
      (service: MailService) => service.sendVerificationEmail(user),
      'Please confirm your email',
      '1234',
    ],
    [
      'password reset',
      (service: MailService) => service.sendResetPasswordEmail(user),
      'Reset Your Password',
      '1234',
    ],
    [
      'invitation',
      (service: MailService) =>
        service.sendInvitationEmail({
          inviterUsername: 'Alex',
          email: user.email,
          invitationToken: 'invite-token',
        }),
      'You are invited to join a room',
      'invite-token',
    ],
  ])(
    'sends the %s template through Brevo',
    async (_name, send, subject, content) => {
      await send(new MailService(config as unknown as ConfigService));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, rawOptions] = fetchMock.mock.calls[0];
      const options = rawOptions as RequestInit;
      expect(url).toBe('https://api.brevo.com/v3/smtp/email');
      expect((options.headers as Record<string, string>)['api-key']).toBe(
        'test-api-key',
      );
      const body = JSON.parse(options.body as string);
      expect(body.sender).toEqual({
        name: 'Paradiso',
        email: 'verified@example.test',
      });
      expect(body.to).toEqual([{ email: user.email }]);
      expect(body.subject).toBe(subject);
      expect(body.htmlContent).toContain(content);
      if (subject === 'You are invited to join a room') {
        expect(body.htmlContent).toContain(
          'https://paradiso.example.test/invitation/invite-token',
        );
      }
    },
  );

  it('rejects failed delivery', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    const service = new MailService(config as unknown as ConfigService);

    await expect(service.sendVerificationEmail(user)).rejects.toThrow(
      'Brevo email request failed with status 401',
    );
  });
});
