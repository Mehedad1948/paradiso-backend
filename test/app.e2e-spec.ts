import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { Server } from 'node:http';
import { MoviesController } from '../src/movies/movies.controller';
import { MoviesService } from '../src/movies/providers/movies.service';
import { MovieDbService } from '../src/movies/providers/MovieDb.serviec';
import { AccessTokenGuard } from '../src/auth/guards/access-token/access-token.guard';
import { AuthenticationGuard } from '../src/auth/guards/authentication/authentication.guard';
import jwtConfig from '../src/auth/config/jwt.config';

describe('Movie HTTP boundary', () => {
  let app: INestApplication<Server>;
  const movies = {
    getAllMovies: jest.fn().mockResolvedValue({ data: [] }),
    createMovie: jest.fn(),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [MoviesController],
      providers: [
        { provide: MoviesService, useValue: movies },
        { provide: MovieDbService, useValue: {} },
        {
          provide: jwtConfig.KEY,
          useValue: {
            secret: 'http-boundary-test',
            issuer: 'test',
            audience: 'test',
          },
        },
        JwtService,
        AccessTokenGuard,
        { provide: APP_GUARD, useClass: AuthenticationGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  it('serves the public catalogue', () =>
    request(app.getHttpServer())
      .get('/movies')
      .expect(200)
      .expect({ data: [] }));
  it('rejects unbounded pagination', () =>
    request(app.getHttpServer()).get('/movies?limit=101').expect(400));
  it('rejects malformed UUIDs', () =>
    request(app.getHttpServer()).get('/movies/not-a-uuid').expect(400));
  it('requires authentication for movie creation', async () => {
    await request(app.getHttpServer())
      .post('/movies')
      .send({ title: 'Movie', dbId: 1 })
      .expect(401);
    expect(movies.createMovie).not.toHaveBeenCalled();
  });
});
