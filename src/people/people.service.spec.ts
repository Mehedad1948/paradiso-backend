import {
  BadGatewayException,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Server } from 'node:http';
import * as request from 'supertest';
import { Repository } from 'typeorm';
import { Movie } from '../movies/movie.entity';
import {
  MovieDbService,
  TmdbPerson,
} from '../movies/providers/MovieDb.serviec';
import { ContentBlocksService } from '../movies/providers/content-blocks.service';
import { PeopleController } from './people.controller';
import {
  PERSON_EXPIRED_MS,
  PERSON_FRESH_MS,
  PERSON_NOT_FOUND_MS,
  PeopleService,
} from './people.service';
import { sortCredits, toPersonProfile } from './person-credits';

const film = (id: number, release_date: string, extra = {}) => ({
  id,
  title: 'Film ' + id,
  release_date,
  poster_path: '/' + id + '.jpg',
  vote_average: 7.5,
  vote_count: 100,
  ...extra,
});

const nolan = (extra: Partial<TmdbPerson> = {}): TmdbPerson => ({
  id: 525,
  name: 'Christopher Nolan',
  biography: 'Director of films.',
  birthday: '1970-07-30',
  deathday: null,
  place_of_birth: 'London, England, UK',
  profile_path: '/nolan.jpg',
  known_for_department: 'Directing',
  external_ids: { imdb_id: 'nm0634240' },
  movie_credits: {
    cast: [
      film(10, '2010-07-15', { character: 'Himself' }),
      film(11, '2003-01-01', { character: 'Self - Host' }),
      film(12, '1998-04-24', { character: 'Man in Bar' }),
      film(12, '1998-04-24', { character: 'Narrator' }),
      film(13, '2015-01-01', { character: 'Himself (archive footage)' }),
      film(14, '2016-01-01', { character: 'Bartender (archive footage)' }),
    ],
    crew: [
      film(27205, '2010-07-15', { job: 'Director' }),
      film(27205, '2010-07-15', { job: 'Writer' }),
      film(27205, '2010-07-15', { job: 'Producer' }),
      film(27205, '2010-07-15', { job: 'Writer' }),
      film(872585, '2023-07-19', { job: 'Director' }),
      film(1, '', { job: 'Director', title: 'Unannounced' }),
      film(2, '2026-07-17', { job: 'Director' }),
      film(3, '2001-01-01', { job: 'Director', adult: true }),
    ],
  },
  ...extra,
});

describe('toPersonProfile', () => {
  it('maps the profile and returns image paths, not URLs', () => {
    expect(toPersonProfile(nolan())).toMatchObject({
      id: 525,
      name: 'Christopher Nolan',
      birthday: '1970-07-30',
      deathday: null,
      placeOfBirth: 'London, England, UK',
      profile_path: '/nolan.jpg',
      knownForDepartment: 'Directing',
      imdbId: 'nm0634240',
    });
  });

  it('merges several jobs on one film into a single crew entry', () => {
    const { crew } = toPersonProfile(nolan()).credits;
    expect(crew).toEqual([
      {
        tmdbId: 27205,
        movieId: null,
        title: 'Film 27205',
        release_date: '2010-07-15',
        poster_path: '/27205.jpg',
        vote_average: 7.5,
        jobs: ['Writer', 'Producer'],
      },
    ]);
  });

  it('puts unreleased films first, then newest first, and drops adult titles', () => {
    const { directing } = toPersonProfile(nolan()).credits;
    expect(directing.map((item) => item.tmdbId)).toEqual([1, 2, 872585, 27205]);
    expect(directing[0].release_date).toBeNull();
  });

  it('drops self appearances and joins several roles in one film', () => {
    expect(toPersonProfile(nolan()).credits.acting).toEqual([
      expect.objectContaining({
        tmdbId: 12,
        character: 'Man in Bar / Narrator',
      }),
    ]);
  });

  it('reports unrated films without a score', () => {
    const [item] = sortCredits(
      toPersonProfile(
        nolan({
          movie_credits: {
            crew: [film(5, '2020-01-01', { job: 'Director', vote_count: 0 })],
          },
        }),
      ).credits.directing,
    );
    expect(item.vote_average).toBeNull();
  });
});

describe('PeopleService', () => {
  let catalogue: { getPerson: jest.Mock; getPersonProfile: jest.Mock };
  let getMany: jest.Mock;
  let where: jest.Mock;
  let service: PeopleService;
  let blockedPeople: Set<number>;
  let blockedMovies: Set<number>;

  beforeEach(() => {
    catalogue = {
      getPerson: jest.fn(() => Promise.resolve(nolan())),
      getPersonProfile: jest.fn(() =>
        Promise.resolve({ id: 525, biography: 'English biography.' }),
      ),
    };
    getMany = jest.fn(() =>
      Promise.resolve([{ id: 'our-inception', dbId: 27205 }]),
    );
    where = jest.fn(() => ({ getMany }));
    const repository = {
      createQueryBuilder: () => ({ select: () => ({ where }) }),
    };
    blockedPeople = new Set();
    blockedMovies = new Set();
    const contentBlocks = {
      isBlocked: (kind: string, id: number) =>
        Promise.resolve(
          (kind === 'person' ? blockedPeople : blockedMovies).has(id),
        ),
      blocked: (kind: string, ids: number[]) =>
        Promise.resolve(
          new Set(
            ids.filter((id) =>
              (kind === 'person' ? blockedPeople : blockedMovies).has(id),
            ),
          ),
        ),
    };
    service = new PeopleService(
      repository as unknown as Repository<Movie>,
      catalogue as unknown as MovieDbService,
      contentBlocks as unknown as ContentBlocksService,
    );
  });

  it('fills movieId from the library with one batch query', async () => {
    const person = await service.getPerson(525);
    const inception = { tmdbId: 27205, movieId: 'our-inception' };
    expect(person.credits.directing).toContainEqual(
      expect.objectContaining(inception),
    );
    expect(person.credits.crew).toContainEqual(
      expect.objectContaining(inception),
    );
    expect(
      person.credits.directing.find((item) => item.tmdbId === 872585)!.movieId,
    ).toBeNull();
    expect(getMany).toHaveBeenCalledTimes(1);
    expect(where.mock.calls[0][1].tmdbIds).toEqual(
      expect.arrayContaining([27205, 872585, 12]),
    );
  });

  it('caches TMDb data but looks up library matches on every request', async () => {
    await service.getPerson(525);
    getMany.mockResolvedValueOnce([]);
    const second = await service.getPerson(525);
    expect(catalogue.getPerson).toHaveBeenCalledTimes(1);
    expect(getMany).toHaveBeenCalledTimes(2);
    expect(second.credits.crew[0].movieId).toBeNull();
    // The cached copy is untouched by either request's matches.
    expect((await service.getPerson(525)).credits.crew[0].movieId).toBe(
      'our-inception',
    );
  });

  it('keys the cache by language', async () => {
    await service.getPerson(525);
    await service.getPerson(525, 'fr-FR');
    expect(catalogue.getPerson.mock.calls).toEqual([
      [525, 'en-US'],
      [525, 'fr-FR'],
    ]);
  });

  it('serves a stale copy while refreshing it in the background', async () => {
    await service.getPerson(525);
    catalogue.getPerson.mockResolvedValueOnce(nolan({ name: 'Refreshed' }));
    const stale = await service.getPerson(
      525,
      'en-US',
      Date.now() + PERSON_FRESH_MS,
    );
    expect(stale.name).toBe('Christopher Nolan');
    expect(catalogue.getPerson).toHaveBeenCalledTimes(2);
    await new Promise((resolve) => setImmediate(resolve));
    expect((await service.getPerson(525)).name).toBe('Refreshed');
  });

  it('keeps the stale copy when the background refresh fails', async () => {
    await service.getPerson(525);
    catalogue.getPerson.mockRejectedValueOnce(new BadGatewayException());
    const later = Date.now() + PERSON_FRESH_MS;
    await service.getPerson(525, 'en-US', later);
    await new Promise((resolve) => setImmediate(resolve));
    expect((await service.getPerson(525, 'en-US', later)).name).toBe(
      'Christopher Nolan',
    );
  });

  it('fetches again once the cached copy expires', async () => {
    await service.getPerson(525);
    catalogue.getPerson.mockRejectedValueOnce(new BadGatewayException());
    await expect(
      service.getPerson(525, 'en-US', Date.now() + PERSON_EXPIRED_MS),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('caches "not found" briefly', async () => {
    catalogue.getPerson.mockRejectedValue(new NotFoundException());
    await expect(service.getPerson(1)).rejects.toThrow('Person not found');
    await expect(service.getPerson(1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(catalogue.getPerson).toHaveBeenCalledTimes(1);
    await expect(
      service.getPerson(1, 'en-US', Date.now() + PERSON_NOT_FOUND_MS),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(catalogue.getPerson).toHaveBeenCalledTimes(2);
  });

  it('never caches upstream failures', async () => {
    catalogue.getPerson.mockRejectedValueOnce(new BadGatewayException());
    await expect(service.getPerson(525)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    await expect(service.getPerson(525)).resolves.toMatchObject({ id: 525 });
    expect(catalogue.getPerson).toHaveBeenCalledTimes(2);
  });

  it('shares one TMDb request between concurrent misses', async () => {
    await Promise.all([service.getPerson(525), service.getPerson(525)]);
    expect(catalogue.getPerson).toHaveBeenCalledTimes(1);
  });

  it('falls back to the English biography when the requested one is empty', async () => {
    catalogue.getPerson.mockResolvedValue(nolan({ biography: '' }));
    expect((await service.getPerson(525, 'de-DE')).biography).toBe(
      'English biography.',
    );
    expect(catalogue.getPersonProfile).toHaveBeenCalledWith(525, 'en-US');
    // Already English: nothing to fall back to.
    expect((await service.getPerson(525)).biography).toBe('');
    expect(catalogue.getPersonProfile).toHaveBeenCalledTimes(1);
  });

  it('hides blocked people and blocked films', async () => {
    blockedMovies.add(27205);
    const person = await service.getPerson(525);
    expect(person.credits.directing.map((item) => item.tmdbId)).not.toContain(
      27205,
    );
    expect(person.credits.crew).toEqual([]);
    blockedPeople.add(525);
    await expect(service.getPerson(525)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it.each([
    ['an erotic actress', 'American erotic film actress and nude model.'],
    ['a model', 'Blonde model who appeared in magazine spreads.'],
    ['a Playboy Playmate', 'She was Playboy Playmate of the Month.'],
    ['an adult film performer', 'She began in adult films in 2001.'],
  ])('hides %s by biography', async (_, biography) => {
    catalogue.getPerson.mockResolvedValue(nolan({ biography }));
    await expect(service.getPerson(525)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('checks the English biography when another language is asked for', async () => {
    catalogue.getPerson.mockResolvedValue(nolan({ biography: 'Mannequin.' }));
    catalogue.getPersonProfile.mockResolvedValue({
      id: 525,
      biography: 'A lingerie model.',
    });
    await expect(service.getPerson(525, 'fr-FR')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('hides adult performers', async () => {
    catalogue.getPerson.mockResolvedValue(nolan({ adult: true }));
    await expect(service.getPerson(525)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('GET /people/:tmdbPersonId', () => {
  let app: INestApplication<Server>;
  const people = { getPerson: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PeopleController],
      providers: [{ provide: PeopleService, useValue: people }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => people.getPerson.mockReset());

  it.each(['0', '-5', '1.5', 'abc', '9007199254740993', '00'])(
    'rejects the invalid ID %s with 400',
    async (id) => {
      await request(app.getHttpServer())
        .get('/people/' + id)
        .expect(400);
      expect(people.getPerson).not.toHaveBeenCalled();
    },
  );

  it('rejects an invalid language with 400', async () => {
    await request(app.getHttpServer())
      .get('/people/525?language=english')
      .expect(400);
  });

  it('returns 404 for a person TMDb does not know', async () => {
    people.getPerson.mockRejectedValue(
      new NotFoundException('Person not found'),
    );
    await request(app.getHttpServer()).get('/people/525').expect(404);
  });

  it('returns 502 when TMDb fails', async () => {
    people.getPerson.mockRejectedValue(new BadGatewayException());
    await request(app.getHttpServer()).get('/people/525').expect(502);
  });

  it('serves the person publicly cacheable', async () => {
    people.getPerson.mockResolvedValue({ id: 525, name: 'Christopher Nolan' });
    await request(app.getHttpServer())
      .get('/people/525?language=fr-FR')
      .expect(200)
      .expect('Cache-Control', /public, max-age=600/)
      .expect({ id: 525, name: 'Christopher Nolan' });
    expect(people.getPerson).toHaveBeenCalledWith(525, 'fr-FR');
  });
});
