import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Server } from 'node:http';
import * as request from 'supertest';
import { AccessTokenGuard } from '../auth/guards/access-token/access-token.guard';
import { AuthenticationGuard } from '../auth/guards/authentication/authentication.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { AdminCurationsController } from './curations-admin.controller';
import { CurationsController } from './curations.controller';
import { CurationsService } from './curations.service';

// Stands in for JWT checking: "Bearer admin" and "Bearer user" are the two
// roles, anything else is rejected the way a bad token is.
class FakeAccessTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const role = /^Bearer (admin|user)$/.exec(
      req.headers.authorization ?? '',
    )?.[1];
    if (!role) throw new UnauthorizedException();
    req.user = { sub: 42, role };
    return true;
  }
}

const A = '3f0c1a52-8d1e-4c0b-9d5e-0a1b2c3d4e5f';
const B = '9b2d7f64-1c3a-4e8f-a6b7-5d4c3b2a1f0e';

describe('curations HTTP', () => {
  let app: INestApplication<Server>;
  const service = {
    landingGrid: jest.fn(),
    editorsPicks: jest.fn(),
    adminLandingGrid: jest.fn(),
    adminEditorsPicks: jest.fn(),
    replaceLandingGrid: jest.fn(),
    replaceEditorsPicks: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CurationsController, AdminCurationsController],
      providers: [
        { provide: CurationsService, useValue: service },
        { provide: AccessTokenGuard, useClass: FakeAccessTokenGuard },
        { provide: APP_GUARD, useClass: AuthenticationGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => {
    for (const fn of Object.values(service))
      fn.mockReset().mockResolvedValue({});
  });

  describe('public reads', () => {
    it.each([
      ['/curations/landing-grid', 'landingGrid'],
      ['/curations/editors-picks', 'editorsPicks'],
    ] as const)(
      'GET %s needs no token and sets no cache headers',
      async (path, method) => {
        service[method].mockResolvedValue({ data: [], updatedAt: new Date(0) });
        const response = await request(app.getHttpServer())
          .get(path)
          .expect(200);
        expect(response.headers['cache-control']).toBeUndefined();
        expect(response.body).toEqual({
          data: [],
          updatedAt: '1970-01-01T00:00:00.000Z',
        });
      },
    );
  });

  describe('admin routes', () => {
    const routes: [string, string][] = [
      ['get', '/admin/curations/landing-grid'],
      ['put', '/admin/curations/landing-grid'],
      ['get', '/admin/curations/editors-picks'],
      ['put', '/admin/curations/editors-picks'],
    ];
    const body = (path: string) =>
      path.endsWith('landing-grid') ? { items: [] } : { movieIds: [] };
    const send = (method: string, path: string, auth?: string) => {
      const call = request(app.getHttpServer())[method as 'get' | 'put'](path);
      if (auth) call.set('Authorization', auth);
      return method === 'put' ? call.send(body(path)) : call;
    };

    it.each(routes)('%s %s needs a token (401)', async (method, path) => {
      await send(method, path).expect(401);
    });

    it.each(routes)(
      '%s %s is for site admins only (403)',
      async (method, path) => {
        await send(method, path, 'Bearer user').expect(403);
        for (const fn of Object.values(service))
          expect(fn).not.toHaveBeenCalled();
      },
    );

    it.each(routes)('%s %s lets an admin through', async (method, path) => {
      await send(method, path, 'Bearer admin').expect(200);
    });

    it('passes the admin’s user id and the body to the service', async () => {
      await request(app.getHttpServer())
        .put('/admin/curations/landing-grid')
        .set('Authorization', 'Bearer admin')
        .send({ items: [{ slot: 2, movieId: A, imageUrl: '/x.jpg' }] })
        .expect(200);
      expect(service.replaceLandingGrid).toHaveBeenCalledWith(
        { items: [{ slot: 2, movieId: A, imageUrl: '/x.jpg' }] },
        42,
      );
      await request(app.getHttpServer())
        .put('/admin/curations/editors-picks')
        .set('Authorization', 'Bearer admin')
        .send({ movieIds: [A, B] })
        .expect(200);
      expect(service.replaceEditorsPicks).toHaveBeenCalledWith(
        { movieIds: [A, B] },
        42,
      );
    });
  });

  describe('PUT /admin/curations/landing-grid validation', () => {
    const put = (body: unknown) =>
      request(app.getHttpServer())
        .put('/admin/curations/landing-grid')
        .set('Authorization', 'Bearer admin')
        .send(body as object);
    const cell = (extra: object = {}) => ({
      items: [{ slot: 0, movieId: A, ...extra }],
    });

    it.each([-1, 27, 100, 1.5, '3', null])(
      'rejects slot %p with 400',
      async (slot) => {
        await put(cell({ slot })).expect(400);
        expect(service.replaceLandingGrid).not.toHaveBeenCalled();
      },
    );

    it.each([0, 26])('accepts slot %p', async (slot) => {
      await put(cell({ slot })).expect(200);
    });

    it.each([
      'http://cdn.test/a.jpg',
      'ftp://cdn.test/a.jpg',
      'javascript:alert(1)',
      'posters/a.jpg',
      '//cdn.test/a.jpg',
      'https://',
      'https:// spaced.jpg',
      '/has space.jpg',
      5,
    ])('rejects imageUrl %p with 400', async (imageUrl) => {
      await put(cell({ imageUrl })).expect(400);
      expect(service.replaceLandingGrid).not.toHaveBeenCalled();
    });

    it('rejects an imageUrl over 2048 characters', async () => {
      await put(cell({ imageUrl: '/' + 'a'.repeat(2048) })).expect(400);
    });

    it.each(['https://cdn.test/a.jpg', '/posters/grids/red/dune.webp', '/'])(
      'accepts imageUrl %p',
      async (imageUrl) => {
        await put(cell({ imageUrl })).expect(200);
        expect(service.replaceLandingGrid).toHaveBeenCalledWith(
          cell({ imageUrl }),
          42,
        );
      },
    );

    it.each([null, '', '   '])(
      'reads imageUrl %p as not set',
      async (imageUrl) => {
        await put(cell({ imageUrl })).expect(200);
        expect(service.replaceLandingGrid).toHaveBeenCalledWith(
          cell({ imageUrl: null }),
          42,
        );
      },
    );

    it('limits objectPosition to 40 characters', async () => {
      await put(cell({ objectPosition: 'x'.repeat(41) })).expect(400);
      await put(cell({ objectPosition: 'x'.repeat(40) })).expect(200);
      await put(cell({ objectPosition: 7 })).expect(400);
      expect(service.replaceLandingGrid).toHaveBeenCalledTimes(1);
    });

    it('requires a UUID movieId and rejects unknown fields and bad shapes', async () => {
      await put(cell({ movieId: 'not-a-uuid' })).expect(400);
      await put(cell({ movieId: 12 })).expect(400);
      await put({ items: [{ slot: 0 }] }).expect(400);
      await put(cell({ extra: true })).expect(400);
      await put({ items: 'nope' }).expect(400);
      await put({}).expect(400);
      await put({ items: [], extra: 1 }).expect(400);
      expect(service.replaceLandingGrid).not.toHaveBeenCalled();
    });

    it('lowercases movie ids', async () => {
      await put(cell({ movieId: A.toUpperCase() })).expect(200);
      expect(service.replaceLandingGrid).toHaveBeenCalledWith(cell(), 42);
    });

    it('takes at most 27 cells', async () => {
      const items = (n: number) =>
        Array.from({ length: n }, (_, slot) => ({ slot, movieId: A }));
      await put({ items: items(27) }).expect(200);
      await put({ items: [...items(27), { slot: 0, movieId: A }] }).expect(400);
    });

    it('leaves repeated slots to the service, which answers 400 itself', async () => {
      await put({
        items: [
          { slot: 1, movieId: A },
          { slot: 1, movieId: B },
        ],
      }).expect(200);
      expect(service.replaceLandingGrid).toHaveBeenCalledTimes(1);
    });
  });

  describe('PUT /admin/curations/editors-picks validation', () => {
    const put = (body: unknown) =>
      request(app.getHttpServer())
        .put('/admin/curations/editors-picks')
        .set('Authorization', 'Bearer admin')
        .send(body as object);
    const ids = (n: number) =>
      Array.from(
        { length: n },
        (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      );

    it('takes 0 to 40 ids and rejects 41 with 400', async () => {
      await put({ movieIds: [] }).expect(200);
      await put({ movieIds: ids(40) }).expect(200);
      await put({ movieIds: ids(41) }).expect(400);
      expect(service.replaceEditorsPicks).toHaveBeenCalledTimes(2);
    });

    it('rejects ids that are not UUIDs, other shapes and unknown fields', async () => {
      await put({ movieIds: [A, 'nope'] }).expect(400);
      await put({ movieIds: [A, 5] }).expect(400);
      await put({ movieIds: A }).expect(400);
      await put({}).expect(400);
      await put({ movieIds: [], extra: 1 }).expect(400);
      expect(service.replaceEditorsPicks).not.toHaveBeenCalled();
    });

    it('lowercases ids so a repeat in another case is still a repeat', async () => {
      await put({ movieIds: [A.toUpperCase(), A] }).expect(200);
      expect(service.replaceEditorsPicks).toHaveBeenCalledWith(
        { movieIds: [A, A] },
        42,
      );
    });
  });
});
