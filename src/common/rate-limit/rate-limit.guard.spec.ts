/* eslint-disable @typescript-eslint/unbound-method -- the decorator's metadata sits on the prototype function the guard reads */
import {
  Controller,
  ExecutionContext,
  HttpCode,
  HttpException,
  INestApplication,
  Post,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Server } from 'node:http';
import * as request from 'supertest';
import { CacheModule } from '../../cache/cache.module';
import { CacheService } from '../../cache/cache.service';
import {
  RateLimit,
  RateLimitGuard,
  RateLimitOptions,
} from './rate-limit.guard';

const options: RateLimitOptions = {
  name: 'sign-in',
  windowSeconds: 900,
  rules: [
    { by: 'emailIp', limit: 2 },
    { by: 'email', limit: 4 },
    { by: 'ip', limit: 5 },
  ],
};
// A route carrying the decorator, so the guard reads real metadata.
class Routes {
  @RateLimit(options)
  limited() {}
  open() {}
}

type Req = { headers?: Record<string, string>; body?: unknown; ip?: string };

function context(
  handler: () => void,
  request: Req,
  sent: Record<string, string>,
) {
  return {
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => ({ headers: {}, ...request }),
      getResponse: () => ({
        setHeader: (name: string, value: string) => (sent[name] = value),
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let cache: CacheService;
  let sent: Record<string, string>;
  const call = (request: Req, handler: () => void = Routes.prototype.limited) =>
    guard.canActivate(context(handler, request, sent));
  const signIn = (email: string, ip: string) =>
    call({
      body: { email },
      headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` },
    });

  beforeEach(() => {
    sent = {};
    cache = new CacheService(new ConfigService({}));
    guard = new RateLimitGuard(
      new Reflector(),
      new ConfigService({ appConfig: { environment: 'development' } }),
      cache,
    );
  });

  it('allows attempts up to the limit, then answers 429 with Retry-After', async () => {
    await expect(signIn('a@x.test', '1.1.1.1')).resolves.toBe(true);
    await expect(signIn('a@x.test', '1.1.1.1')).resolves.toBe(true);
    const error = await signIn('a@x.test', '1.1.1.1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect((error as HttpException).getResponse()).toMatchObject({
      statusCode: 429,
      error: 'Too Many Requests',
      message: expect.stringMatching(
        /^Too many attempts\. Try again in \d+ seconds\.$/,
      ) as string,
    });
    expect(Number(sent['Retry-After'])).toBeGreaterThan(0);
  });

  it('does not lock an account out for a different client', async () => {
    for (let i = 0; i < 2; i++) await signIn('a@x.test', '1.1.1.1');
    await expect(signIn('a@x.test', '1.1.1.1')).rejects.toBeInstanceOf(
      HttpException,
    );
    await expect(signIn('a@x.test', '2.2.2.2')).resolves.toBe(true);
  });

  it('still caps one account across clients, and one client across accounts', async () => {
    for (let i = 1; i <= 4; i++) await signIn('a@x.test', `9.9.9.${i}`);
    await expect(signIn('a@x.test', '9.9.9.9')).rejects.toBeInstanceOf(
      HttpException,
    );
    for (let i = 1; i <= 5; i++) await signIn(`u${i}@x.test`, '3.3.3.3');
    await expect(signIn('u6@x.test', '3.3.3.3')).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('ignores case and spaces in the address, and a malformed email', async () => {
    await signIn('A@X.test', '1.1.1.1');
    await signIn(' a@x.TEST ', '1.1.1.1');
    await expect(signIn('a@x.test', '1.1.1.1')).rejects.toBeInstanceOf(
      HttpException,
    );
    await expect(
      call({
        body: { email: { $ne: 1 } },
        headers: { 'x-forwarded-for': '4.4.4.4' },
      }),
    ).resolves.toBe(true);
  });

  it('leaves other routes alone, and every route in tests', async () => {
    for (let i = 0; i < 20; i++)
      await expect(call({ body: {} }, Routes.prototype.open)).resolves.toBe(
        true,
      );
    const inTests = new RateLimitGuard(
      new Reflector(),
      new ConfigService({ appConfig: { environment: 'test' } }),
      cache,
    );
    for (let i = 0; i < 20; i++)
      await expect(
        inTests.canActivate(
          context(
            Routes.prototype.limited,
            { body: { email: 'a@x.test' } },
            sent,
          ),
        ),
      ).resolves.toBe(true);
  });

  it('keeps no address or IP in the counter keys', async () => {
    const spy = jest.spyOn(cache, 'increment');
    await signIn('secret@x.test', '5.6.7.8');
    const keys = spy.mock.calls.map(([key]) => key).join(' ');
    expect(keys).not.toContain('secret');
    expect(keys).not.toContain('5.6.7.8');
    expect(keys).toContain('rl:sign-in:');
  });
});

// The real module graph: the guard is built by Nest from the global config
// and cache modules, and the answer is what a client would see.
@Controller('demo')
class DemoController {
  @Post('sign-in')
  @HttpCode(200)
  @RateLimit({
    name: 'demo',
    windowSeconds: 60,
    rules: [{ by: 'emailIp', limit: 2 }],
  })
  signIn() {
    return { ok: true };
  }
}

describe('RateLimit over HTTP', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ appConfig: { environment: 'development' } })],
        }),
        CacheModule,
      ],
      controllers: [DemoController],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
  });
  afterAll(() => app.close());

  it('answers 429 with Retry-After and a readable message after the limit', async () => {
    const attempt = () =>
      request(server)
        .post('/demo/sign-in')
        .set('X-Forwarded-For', '8.8.8.8, 10.0.0.1')
        .send({ email: 'person@example.test' });
    await attempt().expect(200);
    await attempt().expect(200);
    const blocked = await attempt().expect(429);
    expect(blocked.headers['retry-after']).toMatch(/^\d+$/);
    expect(blocked.body).toMatchObject({
      statusCode: 429,
      error: 'Too Many Requests',
    });
    // A different client is unaffected.
    await request(server)
      .post('/demo/sign-in')
      .set('X-Forwarded-For', '9.9.9.9')
      .send({ email: 'person@example.test' })
      .expect(200);
  });
});
