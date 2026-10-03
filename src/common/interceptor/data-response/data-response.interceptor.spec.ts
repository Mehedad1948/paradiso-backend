import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom, of } from 'rxjs';
import { User } from '../../../users/user.entity';
import { DataResponseInterceptor } from './data-response.interceptor';

describe('Response serialization', () => {
  const interceptor = new DataResponseInterceptor(
    new ConfigService({ appConfig: { apiVersion: '1' } }),
  );
  const context = {} as ExecutionContext;
  it('removes password and verification fields from nested entities', async () => {
    const user = Object.assign(new User(), {
      id: 1,
      username: 'User',
      password: 'private',
      verificationCode: '1234',
      verificationCodeExpiresAt: new Date(),
    });
    const response = await lastValueFrom(
      interceptor.intercept(context, {
        handle: () => of({ movie: { addedBy: user } }),
      }),
    );
    expect(response).toEqual({
      movie: { addedBy: { id: 1, username: 'User' } },
      apiVersion: '1',
    });
  });
  it('wraps arrays as data while preserving their shape', async () => {
    const response = await lastValueFrom(
      interceptor.intercept(context, {
        handle: () => of([{ id: 1 }, { id: 2 }]),
      }),
    );
    expect(response).toEqual({ data: [{ id: 1 }, { id: 2 }], apiVersion: '1' });
  });
});
