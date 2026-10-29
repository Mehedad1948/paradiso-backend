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
import { AdminFeaturedController } from './featured-admin.controller';
import { FeaturedAdminService } from './featured-admin.service';
import { FeaturedArtistsController } from './featured-artists.controller';
import { FeaturedArtistsService } from './featured-artists.service';

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

const item = (isToday: boolean) => ({
  date: '2026-10-29',
  isToday,
  person: {
    id: 1,
    name: 'A',
    profile_path: '/a.jpg',
    knownForDepartment: null,
  },
  tagline: null,
  knownFor: [],
  libraryFilmCount: null,
});

describe('featured artist HTTP', () => {
  let app: INestApplication<Server>;
  const featured = { list: jest.fn() };
  const admin = {
    listDays: jest.fn(),
    getDay: jest.fn(),
    setDay: jest.fn(),
    removeDay: jest.fn(),
    listCandidates: jest.fn(),
    upsertCandidate: jest.fn(),
    removeCandidate: jest.fn(),
    searchPeople: jest.fn(),
    preview: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [FeaturedArtistsController, AdminFeaturedController],
      providers: [
        { provide: FeaturedArtistsService, useValue: featured },
        { provide: FeaturedAdminService, useValue: admin },
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
    jest.restoreAllMocks();
    featured.list.mockReset().mockResolvedValue({ data: [item(true)] });
    for (const fn of Object.values(admin)) fn.mockReset();
  });

  describe('GET /featured-artists', () => {
    const get = (query = '') =>
      request(app.getHttpServer()).get('/featured-artists' + query);

    it('needs no token and defaults to 11 items', async () => {
      await get().expect(200);
      expect(featured.list).toHaveBeenCalledWith(11);
    });

    it('passes a valid limit through', async () => {
      await get('?limit=3').expect(200);
      expect(featured.list).toHaveBeenCalledWith(3);
      await get('?limit=1').expect(200);
      await get('?limit=11').expect(200);
    });

    it.each(['0', '12', '50', '-1', '2.5', 'abc', ''])(
      'rejects limit=%s with 400',
      async (limit) => {
        await get('?limit=' + limit).expect(400);
        expect(featured.list).not.toHaveBeenCalled();
      },
    );

    it('rejects unknown query parameters', async () => {
      await get('?page=2').expect(400);
    });

    it('is publicly cacheable for 5 minutes', async () => {
      jest
        .spyOn(Date, 'now')
        .mockReturnValue(Date.parse('2026-10-29T10:00:00Z'));
      await get().expect(
        'Cache-Control',
        'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
      );
    });

    it('caps s-maxage at the time left until 00:00 UTC', async () => {
      jest
        .spyOn(Date, 'now')
        .mockReturnValue(Date.parse('2026-10-29T23:58:00Z'));
      await get().expect(
        'Cache-Control',
        'public, max-age=300, s-maxage=120, stale-while-revalidate=600',
      );
    });

    it('asks for a recheck sooner while an older pick stands in for today', async () => {
      featured.list.mockResolvedValue({ data: [item(false)] });
      jest
        .spyOn(Date, 'now')
        .mockReturnValue(Date.parse('2026-10-29T10:00:00Z'));
      await get().expect(
        'Cache-Control',
        'public, max-age=60, s-maxage=60, stale-while-revalidate=600',
      );
    });

    it('wraps the list with the API version', async () => {
      const response = await get().expect(200);
      expect(response.body).toMatchObject({
        data: [expect.objectContaining({ isToday: true })],
      });
    });
  });

  describe('admin endpoints', () => {
    const routes: [string, string][] = [
      ['get', '/admin/featured-artists'],
      ['get', '/admin/featured-artists/2026-10-29'],
      ['put', '/admin/featured-artists/2026-10-29'],
      ['delete', '/admin/featured-artists/2026-10-29'],
      ['get', '/admin/featured-candidates'],
      ['put', '/admin/featured-candidates/525'],
      ['delete', '/admin/featured-candidates/525'],
      ['get', '/admin/featured-people/search?query=nolan'],
      ['get', '/admin/featured-people/525/preview'],
    ];
    const send = (
      method: string,
      path: string,
      auth?: string,
      body: object = { tmdbPersonId: 525, boost: 2 },
    ) => {
      const call = request(app.getHttpServer())[
        method as 'get' | 'put' | 'delete'
      ](path);
      if (auth) call.set('Authorization', auth);
      return method === 'put' ? call.send(body) : call;
    };

    it.each(routes)('%s %s needs a token (401)', async (method, path) => {
      await send(method, path).expect(401);
    });

    it.each(routes)(
      '%s %s is for site admins only (403)',
      async (method, path) => {
        await send(method, path, 'Bearer user').expect(403);
        for (const fn of Object.values(admin))
          expect(fn).not.toHaveBeenCalled();
      },
    );

    it('lets an admin through and passes their user id', async () => {
      admin.setDay.mockResolvedValue({ date: '2026-10-30' });
      await send('put', '/admin/featured-artists/2026-10-30', 'Bearer admin', {
        tmdbPersonId: 525,
        tagline: 'Master of time',
      }).expect(200);
      expect(admin.setDay).toHaveBeenCalledWith(
        '2026-10-30',
        { tmdbPersonId: 525, tagline: 'Master of time' },
        42,
      );
    });

    it('validates request bodies and IDs', async () => {
      const put = (path: string, body: object) =>
        send('put', path, 'Bearer admin', body);
      await put('/admin/featured-artists/2026-10-30', {}).expect(400);
      await put('/admin/featured-artists/2026-10-30', {
        tmdbPersonId: 'x',
      }).expect(400);
      await put('/admin/featured-artists/2026-10-30', {
        tmdbPersonId: 1,
        extra: true,
      }).expect(400);
      await put('/admin/featured-candidates/1.5', { boost: 2 }).expect(400);
      await put('/admin/featured-candidates/0', { boost: 2 }).expect(400);
      await put('/admin/featured-candidates/525', { boost: 'lots' }).expect(
        400,
      );
      await put('/admin/featured-candidates/525', { blocked: 'yes' }).expect(
        400,
      );
      expect(admin.setDay).not.toHaveBeenCalled();
      expect(admin.upsertCandidate).not.toHaveBeenCalled();
      // Range checks on boost belong to the service, which answers 422.
      admin.upsertCandidate.mockResolvedValue({});
      await put('/admin/featured-candidates/525', { boost: 11 }).expect(200);
      expect(admin.upsertCandidate).toHaveBeenCalledWith(
        525,
        { boost: 11 },
        42,
      );
    });

    it('validates list queries', async () => {
      const get = (path: string) => send('get', path, 'Bearer admin');
      await get('/admin/featured-artists?from=yesterday').expect(400);
      await get('/admin/featured-candidates?boosted=maybe').expect(400);
      await get('/admin/featured-candidates?limit=101').expect(400);
      await get('/admin/featured-candidates?page=0').expect(400);
      await get('/admin/featured-people/search').expect(400);
      await get('/admin/featured-people/search?query=a&page=501').expect(400);
      await get('/admin/featured-people/abc/preview').expect(400);
    });

    it('parses boolean filters and builds pagination links', async () => {
      admin.listCandidates.mockResolvedValue({
        data: [],
        meta: {
          totalItems: 0,
          itemsPerPage: 10,
          currentPage: 1,
          totalPages: 0,
        },
      });
      const response = await send(
        'get',
        '/admin/featured-candidates?boosted=true&blocked=false',
        'Bearer admin',
      ).expect(200);
      expect(admin.listCandidates).toHaveBeenCalledWith(
        expect.objectContaining({ boosted: true, blocked: false }),
      );
      expect(response.body.links.first).toContain(
        '/admin/featured-candidates?',
      );
      expect(response.body.links.first).toContain('limit=10');
    });

    it('builds search links without a limit', async () => {
      admin.searchPeople.mockResolvedValue({
        data: [],
        meta: {
          totalItems: 40,
          itemsPerPage: 20,
          currentPage: 1,
          totalPages: 2,
        },
      });
      const response = await send(
        'get',
        '/admin/featured-people/search?query=nolan',
        'Bearer admin',
      ).expect(200);
      expect(admin.searchPeople).toHaveBeenCalledWith('nolan', 1);
      expect(response.body.links.next).toContain('page=2');
      expect(response.body.links.next).not.toContain('limit');
    });
  });
});
