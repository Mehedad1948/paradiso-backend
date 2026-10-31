import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { CacheService } from '../../cache/cache.service';

// What a limit counts. `emailIp` keeps one person's typos from locking an
// account out for everyone else; `email` alone is a loose ceiling for an
// attacker who rotates IPs; `ip` stops one client trying many accounts.
export type RateLimitBy = 'ip' | 'email' | 'emailIp';

export interface RateLimitOptions {
  // Part of the counter's key, so routes do not share counts.
  name: string;
  windowSeconds: number;
  rules: { by: RateLimitBy; limit: number }[];
}

const RATE_LIMIT_KEY = 'rateLimit';

// Limits a route per client. Over the limit: 429 with Retry-After.
export const RateLimit = (options: RateLimitOptions) =>
  applyDecorators(
    SetMetadata(RATE_LIMIT_KEY, options),
    UseGuards(RateLimitGuard),
  );

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly cache: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get<RateLimitOptions | undefined>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );
    // The database suite signs in with one account over and over.
    if (!options || this.config.get('appConfig.environment') === 'test')
      return true;
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const ip = clientIp(request);
    const email = emailOf(request.body);

    let retryAfter = 0;
    for (const { by, limit } of options.rules) {
      const id =
        by === 'ip'
          ? ip
          : by === 'email'
            ? email
            : email && ip
              ? `${email}|${ip}`
              : null;
      // Nothing to count by (no email sent): validation will reject it.
      if (!id) continue;
      const { count, resetInSeconds } = await this.cache.increment(
        `rl:${options.name}:${by}:${digest(id)}`,
        options.windowSeconds,
      );
      if (count > limit) retryAfter = Math.max(retryAfter, resetInSeconds);
    }
    if (!retryAfter) return true;
    http.getResponse<Response>().setHeader('Retry-After', String(retryAfter));
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: `Too many attempts. Try again in ${retryAfter} seconds.`,
        error: 'Too Many Requests',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

// Behind Render's proxies the socket address is the proxy's, shared by every
// user. The first X-Forwarded-For entry is the client, so a client cannot
// land in someone else's bucket by accident. It can be forged, which is why
// the per-email limits exist too.
function clientIp(request: Request): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
    ?.split(',')[0]
    ?.trim();
  return first || request.ip || null;
}

// Guards run before validation, so the body is untrusted.
function emailOf(body: unknown): string | null {
  const email = (body as { email?: unknown } | undefined)?.email;
  if (typeof email !== 'string') return null;
  return email.trim().toLowerCase().slice(0, 254) || null;
}

// Keeps addresses and IPs out of Redis keys.
function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}
