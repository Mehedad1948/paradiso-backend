/* eslint-disable @typescript-eslint/require-await -- the fake store mimics async queries */
import { BadGatewayException, Logger, NotFoundException } from '@nestjs/common';
import { MovieDbService } from '../movies/providers/MovieDb.serviec';
import { PeopleService } from '../people/people.service';
import { CreditItem, PersonProfile } from '../people/person-credits';
import { FeaturedAdminService } from './featured-admin.service';
import { FeaturedArtist } from './featured-artist.entity';
import {
  DERIVED_TTL_MS,
  FeaturedArtistsService,
  SELECTION_RETRY_MS,
} from './featured-artists.service';
import { FeaturedCandidate } from './featured-candidate.entity';
import { DEFAULT_SCORE_WEIGHTS, FeaturedConfig } from './featured-config';
import { seededRandom } from './featured-scoring';
import { FeaturedSelectionService } from './featured-selection.service';
import {
  CandidateFilter,
  FeaturedStore,
  NewFeaturedArtist,
} from './featured-store';
import { addDays, daysBetween } from './utc-date';

const DAY = 24 * 60 * 60 * 1000;
const START = Date.parse('2026-10-29T10:00:00Z');

const config: FeaturedConfig = {
  cooldownDays: 30,
  hardMinGapDays: 14,
  minCredits: 5,
  scoreWeights: DEFAULT_SCORE_WEIGHTS,
  shortlistSize: 100,
  popularPages: 1,
  fetchConcurrency: 5,
};

// ---- In-memory stand-ins for the database and TMDb ----

class FakeStore {
  rows: FeaturedArtist[] = [];
  candidates: FeaturedCandidate[] = [];
  library: { tmdbPersonId: number; films: number }[] = [];
  private nextId = 1;

  async findByDate(date: string) {
    await Promise.resolve();
    return this.rows.find((row) => row.featureDate === date) ?? null;
  }
  async listUpTo(date: string, limit: number) {
    await Promise.resolve();
    return this.rows
      .filter((row) => row.featureDate <= date)
      .sort((a, b) => b.featureDate.localeCompare(a.featureDate))
      .slice(0, limit);
  }
  async range(from: string, to: string) {
    return this.rows
      .filter((row) => row.featureDate >= from && row.featureDate <= to)
      .sort((a, b) => a.featureDate.localeCompare(b.featureDate));
  }
  async insertIfAbsent(row: NewFeaturedArtist) {
    await Promise.resolve();
    if (this.rows.some((known) => known.featureDate === row.featureDate))
      return false;
    this.add(row);
    return true;
  }
  async replace(row: NewFeaturedArtist) {
    this.rows = this.rows.filter(
      (known) => known.featureDate !== row.featureDate,
    );
    this.add(row);
  }
  async deleteByDate(date: string) {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => row.featureDate !== date);
    return this.rows.length < before;
  }
  async appearances(from: string, to: string) {
    return this.rows
      .filter((row) => row.featureDate >= from && row.featureDate <= to)
      .map(({ tmdbPersonId, featureDate }) => ({ tmdbPersonId, featureDate }));
  }
  async lastFeatured(ids: number[], date: string) {
    const last = new Map<number, string>();
    for (const row of this.rows)
      if (
        ids.includes(row.tmdbPersonId) &&
        row.featureDate <= date &&
        row.featureDate > (last.get(row.tmdbPersonId) ?? '')
      )
        last.set(row.tmdbPersonId, row.featureDate);
    return last;
  }
  async libraryPeople() {
    return this.library;
  }
  async allCandidates() {
    return this.candidates;
  }
  async findCandidate(id: number) {
    return this.candidates.find((row) => row.tmdbPersonId === id) ?? null;
  }
  async findCandidates(ids: number[]) {
    return this.candidates.filter((row) => ids.includes(row.tmdbPersonId));
  }
  async pageCandidates({ boosted, blocked, page, limit }: CandidateFilter) {
    const all = this.candidates.filter(
      (row) =>
        (boosted === undefined || row.boost > 1 === boosted) &&
        (blocked === undefined || row.blocked === blocked),
    );
    return {
      rows: all.slice((page - 1) * limit, page * limit),
      total: all.length,
    };
  }
  async saveCandidate(candidate: FeaturedCandidate) {
    this.candidates = this.candidates.filter(
      (row) => row.tmdbPersonId !== candidate.tmdbPersonId,
    );
    candidate.updatedAt = new Date(Date.now());
    this.candidates.push(candidate);
    return candidate;
  }
  async deleteCandidate(id: number) {
    const before = this.candidates.length;
    this.candidates = this.candidates.filter((row) => row.tmdbPersonId !== id);
    return this.candidates.length < before;
  }
  private add(row: NewFeaturedArtist) {
    this.rows.push({
      ...row,
      id: this.nextId++,
      createdAt: new Date(Date.now()),
      updatedAt: new Date(Date.now()),
    });
  }
}

interface PersonOptions {
  photo?: boolean;
  biography?: string;
  films?: number;
  libraryFilms?: number;
  popularity?: number;
}

const film = (
  id: number,
  libraryId: string | null,
  votes: number,
): CreditItem => ({
  tmdbId: id,
  movieId: libraryId,
  title: 'Film ' + id,
  release_date: '2010-01-01',
  poster_path: '/film' + id + '.jpg',
  vote_average: 7,
  vote_count: votes,
});

function profile(id: number, options: PersonOptions = {}): PersonProfile {
  const films = options.films ?? 8;
  const acting = Array.from({ length: films }, (_, index) =>
    film(
      id * 100 + index,
      index < (options.libraryFilms ?? 0) ? 'lib-' + id + '-' + index : null,
      1000 * (index + 1),
    ),
  );
  return {
    id,
    name: 'Person ' + id,
    biography: options.biography ?? 'A film artist.',
    birthday: null,
    deathday: null,
    placeOfBirth: null,
    profile_path: options.photo === false ? null : '/p' + id + '.jpg',
    knownForDepartment: 'Acting',
    imdbId: null,
    credits: { directing: [], acting, crew: [] },
  };
}

class FakeTmdb {
  people = new Map<number, { profile: PersonProfile; popularity: number }>();
  popular: number[] = [];
  failing: Error | null = null;
  profileCalls = 0;

  add(id: number, options: PersonOptions = {}, listed = true) {
    this.people.set(id, {
      profile: profile(id, options),
      popularity: options.popularity ?? 20,
    });
    if (listed) this.popular.push(id);
  }
  asPeople() {
    const lookup = (id: number) => {
      this.profileCalls++;
      if (this.failing) return Promise.reject(this.failing);
      const found = this.people.get(id);
      return found
        ? Promise.resolve(found)
        : Promise.reject(new NotFoundException('Person not found'));
    };
    return {
      getRankingProfile: lookup,
      getBasics: lookup,
      getPerson: async (id: number) => (await lookup(id)).profile,
    } as unknown as PeopleService;
  }
  asMovieDb() {
    return {
      getPopularPeople: (page: number) => {
        if (this.failing) return Promise.reject(this.failing);
        return Promise.resolve({
          page,
          total_pages: 1,
          total_results: this.popular.length,
          results:
            page === 1
              ? this.popular.map((id) => ({
                  id,
                  name: 'Person ' + id,
                  profile_path: this.people.get(id)?.profile.profile_path,
                  popularity: this.people.get(id)?.popularity,
                }))
              : [],
        });
      },
      searchPeople: (query: string) =>
        Promise.resolve({
          page: 1,
          total_pages: 1,
          total_results: this.popular.length,
          results: this.popular
            .filter((id) => ('person ' + id).includes(query.toLowerCase()))
            .map((id) => ({
              id,
              name: 'Person ' + id,
              profile_path: this.people.get(id)?.profile.profile_path,
              known_for_department: 'Acting',
              popularity: this.people.get(id)?.popularity,
            })),
        }),
    } as unknown as MovieDbService;
  }
}

function build(overrides: Partial<FeaturedConfig> = {}) {
  const store = new FakeStore();
  const tmdb = new FakeTmdb();
  const settings = { ...config, ...overrides };
  const selection = new FeaturedSelectionService(
    store as unknown as FeaturedStore,
    tmdb.asPeople(),
    tmdb.asMovieDb(),
    settings,
  );
  const featured = new FeaturedArtistsService(
    store as unknown as FeaturedStore,
    selection,
    tmdb.asPeople(),
  );
  const admin = new FeaturedAdminService(
    store as unknown as FeaturedStore,
    featured,
    selection,
    tmdb.asPeople(),
    tmdb.asMovieDb(),
    settings,
  );
  return { store, tmdb, selection, featured, admin, settings };
}

let now = START;
let alerts: jest.SpyInstance;
const today = () => new Date(now).toISOString().slice(0, 10);

beforeEach(() => {
  now = START;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  jest.spyOn(Logger.prototype, 'log').mockImplementation();
  jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  alerts = jest.spyOn(Logger.prototype, 'error').mockImplementation();
});
afterEach(() => jest.restoreAllMocks());

const seedPool = (tmdb: FakeTmdb, count = 20) => {
  for (let id = 1; id <= count; id++) tmdb.add(id, { libraryFilms: id % 4 });
};

// ---- The public feed ----

describe('GET /featured-artists data', () => {
  it('creates and returns today’s row on an empty table', async () => {
    const { store, tmdb, featured } = build();
    seedPool(tmdb);
    const { data } = await featured.list();
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ date: today(), isToday: true });
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ source: 'auto', createdBy: null });
  });

  it('gives every client the same person all day', async () => {
    const { tmdb, featured } = build();
    seedPool(tmdb);
    const first = (await featured.list()).data[0].person.id;
    now += 5 * 60 * 60 * 1000;
    const second = (await featured.list()).data[0].person.id;
    expect(second).toBe(first);
  });

  it('makes one row when first requests arrive together', async () => {
    const { store, tmdb, featured, selection } = build();
    seedPool(tmdb);
    const select = jest.spyOn(selection, 'selectFor');
    const lists = await Promise.all([featured.list(), featured.list()]);
    expect(select).toHaveBeenCalledTimes(1);
    expect(store.rows).toHaveLength(1);
    expect(lists[0].data[0].person.id).toBe(lists[1].data[0].person.id);
  });

  it('makes one row when two instances draw for the same day at once', async () => {
    const { store, tmdb, selection } = build();
    seedPool(tmdb);
    const [a, b] = await Promise.all([
      selection.selectFor(today(), seededRandom(1)),
      selection.selectFor(today(), seededRandom(2)),
    ]);
    expect(store.rows).toHaveLength(1);
    expect(a.tmdbPersonId).toBe(b.tmdbPersonId);
  });

  it('moves on at the UTC rollover, with yesterday’s pick second', async () => {
    const { tmdb, featured } = build();
    seedPool(tmdb);
    const day1 = (await featured.list()).data[0].person.id;
    now = Date.parse('2026-10-30T00:00:00Z');
    const { data } = await featured.list();
    expect(data[0]).toMatchObject({ date: '2026-10-30', isToday: true });
    expect(data[0].person.id).not.toBe(day1);
    expect(data[1]).toMatchObject({ date: '2026-10-29', isToday: false });
    expect(data[1].person.id).toBe(day1);
  });

  it('uses the UTC day, not the server’s local one', async () => {
    const { tmdb, featured } = build();
    seedPool(tmdb);
    now = Date.parse('2026-12-31T23:59:59Z');
    expect((await featured.list()).data[0].date).toBe('2026-12-31');
  });

  it('fills knownFor and libraryFilmCount for item 0 only', async () => {
    const { store, tmdb, featured } = build();
    tmdb.add(7, { libraryFilms: 4, films: 8 });
    tmdb.add(8, { libraryFilms: 2, films: 8 });
    for (let day = 3; day >= 1; day--)
      await store.insertIfAbsent({
        featureDate: addDays(today(), -day),
        tmdbPersonId: 8,
        name: 'Person 8',
        profilePath: '/p8.jpg',
        knownForDepartment: 'Acting',
        tagline: null,
        source: 'auto',
        createdBy: null,
      });
    await store.insertIfAbsent({
      featureDate: today(),
      tmdbPersonId: 7,
      name: 'Person 7',
      profilePath: '/p7.jpg',
      knownForDepartment: 'Acting',
      tagline: 'A line',
      source: 'manual',
      createdBy: 1,
    });
    const { data } = await featured.list();
    expect(data).toHaveLength(4);
    expect(data[0].knownFor).toHaveLength(3);
    // Best known first: highest vote_count.
    expect(data[0].knownFor.map((item) => item.tmdbId)).toEqual([
      707, 706, 705,
    ]);
    expect(data[0].knownFor[0]).toEqual({
      tmdbId: 707,
      movieId: null,
      title: 'Film 707',
      poster_path: '/film707.jpg',
      release_date: '2010-01-01',
    });
    expect(data[0].libraryFilmCount).toBe(4);
    expect(data[0].tagline).toBe('A line');
    for (const past of data.slice(1)) {
      expect(past.isToday).toBe(false);
      expect(past.knownFor).toEqual([]);
      expect(past.libraryFilmCount).toBeNull();
    }
  });

  it('skips films without a poster and de-duplicates by film', () => {
    const { tmdb, featured } = build();
    tmdb.add(7);
    const credits = tmdb.people.get(7)!.profile.credits;
    credits.acting[7].poster_path = null;
    credits.directing = [{ ...credits.acting[6], jobs: undefined }];
    return featured.list().then(({ data }) => {
      const ids = data[0].knownFor.map((item) => item.tmdbId);
      expect(ids).toEqual([706, 705, 704]);
    });
  });

  it('honours limit and returns what exists when there are fewer rows', async () => {
    const { tmdb, featured } = build();
    seedPool(tmdb, 40);
    for (let day = 0; day < 5; day++) {
      now = START + day * DAY;
      await featured.list();
    }
    expect((await featured.list(3)).data).toHaveLength(3);
    expect((await featured.list(11)).data).toHaveLength(5);
    expect((await featured.list(1)).data).toHaveLength(1);
  });

  it('never returns future days', async () => {
    const { store, tmdb, featured } = build();
    seedPool(tmdb);
    await featured.list();
    await store.insertIfAbsent({
      featureDate: addDays(today(), 2),
      tmdbPersonId: 3,
      name: 'Person 3',
      profilePath: '/p3.jpg',
      knownForDepartment: null,
      tagline: null,
      source: 'manual',
      createdBy: 1,
    });
    const { data } = await featured.list();
    expect(data.map((item) => item.date)).toEqual([today()]);
  });

  it('shows the cached TMDb data for 6 hours, then looks again', async () => {
    const { tmdb, featured } = build();
    seedPool(tmdb);
    await featured.list();
    const calls = tmdb.profileCalls;
    await featured.list();
    expect(tmdb.profileCalls).toBe(calls);
    now += DERIVED_TTL_MS + 1000;
    // Same UTC day is not required: only the cache age matters.
    await featured.list();
    expect(tmdb.profileCalls).toBeGreaterThan(calls);
  });

  it('keeps serving the card when TMDb fails after the pick was made', async () => {
    const { tmdb, featured } = build();
    seedPool(tmdb);
    await featured.list();
    now += DERIVED_TTL_MS + 1000;
    tmdb.failing = new BadGatewayException();
    const { data } = await featured.list();
    expect(data[0].person.name).toMatch(/Person/);
    expect(data[0].knownFor).toHaveLength(3);
  });
});

describe('when selection fails', () => {
  it('serves the latest existing row and raises an alert', async () => {
    const { store, tmdb, featured } = build();
    seedPool(tmdb);
    await featured.list();
    now += 2 * DAY;
    tmdb.failing = new BadGatewayException();
    const { data } = await featured.list();
    expect(data).toHaveLength(1);
    expect(data[0].date).toBe(addDays(today(), -2));
    expect(data[0].isToday).toBe(false);
    expect(store.rows).toHaveLength(1);
    expect(alerts).toHaveBeenCalledWith(expect.stringContaining('ALERT'));
  });

  it('does not hammer TMDb on every request, then tries again', async () => {
    const { tmdb, featured, selection } = build();
    seedPool(tmdb);
    await featured.list();
    now += DAY;
    tmdb.failing = new BadGatewayException();
    const select = jest.spyOn(selection, 'selectFor');
    await featured.list();
    await featured.list();
    expect(select).toHaveBeenCalledTimes(1);
    tmdb.failing = null;
    now += SELECTION_RETRY_MS + 1;
    expect((await featured.list()).data[0].isToday).toBe(true);
    expect(select).toHaveBeenCalledTimes(2);
  });

  it('fails with 503 only when there is no row at all', async () => {
    const { tmdb, featured } = build();
    tmdb.failing = new BadGatewayException();
    await expect(featured.list()).rejects.toMatchObject({ status: 503 });
  });

  it('the daily job survives a failure and a later request recovers', async () => {
    const { tmdb, featured } = build();
    seedPool(tmdb);
    tmdb.failing = new BadGatewayException();
    await expect(featured.pickToday()).resolves.toBeUndefined();
    tmdb.failing = null;
    expect((await featured.list()).data[0].isToday).toBe(true);
  });
});

// ---- Selection rules ----

describe('automatic selection', () => {
  it('never picks anyone inside the hard gap over 1000 days', async () => {
    const { store, tmdb, selection } = build();
    seedPool(tmdb, 40);
    const random = seededRandom(2026);
    for (let day = 0; day < 1000; day++)
      await selection.selectFor(addDays('2026-01-01', day), random);
    expect(store.rows).toHaveLength(1000);
    const lastSeen = new Map<number, string>();
    let closest = Infinity;
    for (const row of store.rows.sort((a, b) =>
      a.featureDate.localeCompare(b.featureDate),
    )) {
      const last = lastSeen.get(row.tmdbPersonId);
      if (last) closest = Math.min(closest, daysBetween(last, row.featureDate));
      lastSeen.set(row.tmdbPersonId, row.featureDate);
    }
    expect(closest).toBeGreaterThanOrEqual(config.hardMinGapDays);
    // Everyone gets a turn.
    expect(lastSeen.size).toBe(40);
  });

  it('keeps yesterday’s ten-day strip free of repeats', async () => {
    const { store, tmdb, selection } = build();
    seedPool(tmdb, 30);
    const random = seededRandom(5);
    for (let day = 0; day < 200; day++)
      await selection.selectFor(addDays('2026-01-01', day), random);
    const rows = store.rows.sort((a, b) =>
      a.featureDate.localeCompare(b.featureDate),
    );
    for (let i = 0; i < rows.length; i++) {
      const strip = rows
        .slice(Math.max(0, i - 10), i)
        .map((r) => r.tmdbPersonId);
      expect(strip).not.toContain(rows[i].tmdbPersonId);
    }
  });

  it('prefers people with more films in our library', async () => {
    const { tmdb, selection, store } = build({
      cooldownDays: 1,
      hardMinGapDays: 11,
    });
    tmdb.add(1, { libraryFilms: 0 });
    tmdb.add(2, { libraryFilms: 4 });
    const random = seededRandom(11);
    const wins = { 1: 0, 2: 0 };
    for (let run = 0; run < 400; run++) {
      store.rows = [];
      wins[
        (await selection.selectFor('2026-03-01', random)).tmdbPersonId as 1 | 2
      ]++;
    }
    expect(wins[2]).toBeGreaterThan(wins[1] * 1.5);
  });

  it('boost 5 against boost 1 wins about five times as often', async () => {
    const { tmdb, selection, store } = build();
    tmdb.add(1);
    tmdb.add(2);
    store.candidates.push(
      Object.assign(new FeaturedCandidate(), {
        tmdbPersonId: 1,
        boost: 5,
        blocked: false,
      }),
    );
    const random = seededRandom(3);
    const wins = { 1: 0, 2: 0 };
    for (let run = 0; run < 1000; run++) {
      store.rows = [];
      wins[
        (await selection.selectFor('2026-03-01', random)).tmdbPersonId as 1 | 2
      ]++;
    }
    expect(wins[1] / wins[2]).toBeGreaterThan(4);
    expect(wins[1] / wins[2]).toBeLessThan(6.5);
  });

  it('never picks blocked people, or anyone without a photo, biography or enough credits', async () => {
    const { store, tmdb, selection } = build();
    tmdb.add(1);
    tmdb.add(2);
    tmdb.add(3, { photo: false });
    tmdb.add(4, { biography: '  ' });
    tmdb.add(5, { films: 3 });
    tmdb.add(6, {}, false); // only reachable through the library
    store.candidates.push(
      Object.assign(new FeaturedCandidate(), {
        tmdbPersonId: 2,
        boost: 1,
        blocked: true,
      }),
    );
    const random = seededRandom(8);
    for (let run = 0; run < 100; run++) {
      store.rows = [];
      expect([1, 6]).toContain(
        (await selection.selectFor('2026-03-01', random)).tmdbPersonId,
      );
    }
  });

  it('lets a boosted person skip the credit minimum but not the photo', async () => {
    const { store, tmdb, selection } = build();
    tmdb.add(1, { films: 2 });
    tmdb.add(2, { films: 2, photo: false });
    store.candidates.push(
      Object.assign(new FeaturedCandidate(), {
        tmdbPersonId: 1,
        boost: 2,
        blocked: false,
      }),
      Object.assign(new FeaturedCandidate(), {
        tmdbPersonId: 2,
        boost: 9,
        blocked: false,
      }),
    );
    expect((await selection.selectFor('2026-03-01')).tmdbPersonId).toBe(1);
  });

  it('draws from the library too', async () => {
    const { store, tmdb, selection } = build();
    tmdb.add(9, { libraryFilms: 5 }, false);
    store.library = [{ tmdbPersonId: 9, films: 5 }];
    expect((await selection.selectFor('2026-03-01')).tmdbPersonId).toBe(9);
  });

  it('snapshots the name, photo and department', async () => {
    const { tmdb, selection } = build();
    tmdb.add(4);
    expect(await selection.selectFor('2026-03-01')).toMatchObject({
      name: 'Person 4',
      profilePath: '/p4.jpg',
      knownForDepartment: 'Acting',
      tagline: null,
      source: 'auto',
    });
  });

  it('logs the winner, the top candidates and how many were considered', async () => {
    const { tmdb, selection } = build();
    seedPool(tmdb, 8);
    await selection.selectFor('2026-03-01');
    const message = String(
      (Logger.prototype.log as jest.Mock).mock.calls.at(-1)?.[0],
    );
    expect(message).toMatch(/picked Person \d/);
    expect(message).toMatch(/considered 8 of 8 pooled/);
    expect(message).toMatch(/top 5: (Person \d #\d+ \d\.\d{4}(, )?){5}$/);
  });

  it('fails when nobody qualifies, and when TMDb is down', async () => {
    const { tmdb, selection } = build();
    tmdb.add(1, { photo: false });
    await expect(selection.selectFor('2026-03-01')).rejects.toThrow(
      /No eligible/,
    );
    tmdb.failing = new BadGatewayException();
    await expect(selection.selectFor('2026-03-01')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('uses a manual pick to reset the cooldown', async () => {
    const { store, tmdb, selection, admin } = build();
    tmdb.add(1);
    tmdb.add(2);
    await admin.setDay(today(), { tmdbPersonId: 1 }, 99);
    const drawOn = async (day: number, seed: number) => {
      // Only the editor's pick counts as history; person 2 stays free.
      store.rows = store.rows.filter((row) => row.source === 'manual');
      return (
        await selection.selectFor(addDays(today(), day), seededRandom(seed))
      ).tmdbPersonId;
    };
    for (let day = 1; day < 14; day++) expect(await drawOn(day, day)).toBe(2);
    // Back in play once the hard gap has passed.
    const results = new Set<number>();
    for (let seed = 0; seed < 40; seed++) results.add(await drawOn(14, seed));
    expect(results.has(1)).toBe(true);
  });

  it('never overwrites a manual row', async () => {
    const { tmdb, selection, admin, store } = build();
    seedPool(tmdb);
    await admin.setDay(today(), { tmdbPersonId: 5, tagline: 'Chosen' }, 1);
    const row = await selection.selectFor(today());
    expect(row).toMatchObject({ tmdbPersonId: 5, source: 'manual' });
    expect(store.rows).toHaveLength(1);
  });
});

// ---- The admin API ----

describe('admin days', () => {
  it('schedules a future day manually and records who did it', async () => {
    const { tmdb, admin } = build();
    seedPool(tmdb);
    const item = await admin.setDay(
      addDays(today(), 3),
      { tmdbPersonId: 4, tagline: ' Auteur ' },
      77,
    );
    expect(item).toMatchObject({
      date: addDays(today(), 3),
      source: 'manual',
      createdBy: 77,
      tagline: 'Auteur',
      person: { id: 4, name: 'Person 4', profile_path: '/p4.jpg' },
    });
  });

  it('changes the public answer at once when today is overridden', async () => {
    const { tmdb, featured, admin } = build();
    seedPool(tmdb);
    const before = (await featured.list()).data[0];
    const other = before.person.id === 3 ? 4 : 3;
    await admin.setDay(today(), { tmdbPersonId: other }, 1);
    const after = (await featured.list()).data[0];
    expect(after.person.id).toBe(other);
    expect(after.knownFor[0].tmdbId).toBe(other * 100 + 7);
  });

  it('accepts a person an editor has blocked', async () => {
    const { store, tmdb, admin } = build();
    tmdb.add(1);
    store.candidates.push(
      Object.assign(new FeaturedCandidate(), {
        tmdbPersonId: 1,
        boost: 1,
        blocked: true,
      }),
    );
    await expect(
      admin.setDay(today(), { tmdbPersonId: 1 }, 1),
    ).resolves.toMatchObject({ person: { id: 1 } });
  });

  it('ignores the cooldown and the hard gap', async () => {
    const { tmdb, admin } = build();
    tmdb.add(1);
    await admin.setDay(today(), { tmdbPersonId: 1 }, 1);
    await expect(
      admin.setDay(addDays(today(), 1), { tmdbPersonId: 1 }, 1),
    ).resolves.toBeDefined();
  });

  it('replaces an automatic pick for today', async () => {
    const { store, tmdb, featured, admin } = build();
    seedPool(tmdb);
    await featured.list();
    await admin.setDay(today(), { tmdbPersonId: 11 }, 2);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ tmdbPersonId: 11, source: 'manual' });
  });

  it('rejects people without a photo or biography, or unknown to TMDb, with 422', async () => {
    const { tmdb, admin } = build();
    tmdb.add(1, { photo: false });
    tmdb.add(2, { biography: '' });
    for (const id of [1, 2, 404])
      await expect(
        admin.setDay(today(), { tmdbPersonId: id }, 1),
      ).rejects.toMatchObject({ status: 422 });
  });

  it('rejects a tagline over 140 characters with 422', async () => {
    const { tmdb, admin } = build();
    tmdb.add(1);
    await expect(
      admin.setDay(today(), { tmdbPersonId: 1, tagline: 'x'.repeat(141) }, 1),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      admin.setDay(today(), { tmdbPersonId: 1, tagline: 'x'.repeat(140) }, 1),
    ).resolves.toBeDefined();
  });

  it('answers 409 for past days and 400 for malformed dates', async () => {
    const { tmdb, admin } = build();
    tmdb.add(1);
    const yesterday = addDays(today(), -1);
    await expect(
      admin.setDay(yesterday, { tmdbPersonId: 1 }, 1),
    ).rejects.toMatchObject({ status: 409 });
    await expect(admin.removeDay(yesterday, 1)).rejects.toMatchObject({
      status: 409,
    });
    for (const bad of ['today', '2026-13-01', '2026-02-30', '26-1-1'])
      await expect(
        admin.setDay(bad, { tmdbPersonId: 1 }, 1),
      ).rejects.toMatchObject({ status: 400 });
  });

  it('removes a day, and today is refilled by the next draw', async () => {
    const { store, tmdb, featured, admin } = build();
    seedPool(tmdb);
    await admin.setDay(today(), { tmdbPersonId: 3 }, 1);
    await admin.removeDay(today(), 1);
    expect(store.rows).toHaveLength(0);
    await expect(admin.getDay(today())).rejects.toMatchObject({ status: 404 });
    await expect(admin.removeDay(today(), 1)).rejects.toMatchObject({
      status: 404,
    });
    expect((await featured.list()).data[0]).toMatchObject({
      isToday: true,
    });
    expect(store.rows[0].source).toBe('auto');
  });

  it('lists a range with scheduled days, within the limits', async () => {
    const { tmdb, featured, admin } = build();
    seedPool(tmdb);
    await featured.list();
    await admin.setDay(addDays(today(), 5), { tmdbPersonId: 6 }, 1);
    const defaults = await admin.listDays();
    expect(defaults).toMatchObject({
      from: addDays(today(), -30),
      to: addDays(today(), 30),
    });
    expect(defaults.data.map((item) => item.date)).toEqual([
      today(),
      addDays(today(), 5),
    ]);
    expect(defaults.data[0]).toEqual({
      date: today(),
      person: expect.objectContaining({ id: expect.any(Number) }),
      tagline: null,
      source: 'auto',
      createdBy: null,
      createdAt: expect.any(Date),
    });
    await expect(
      admin.listDays('2026-01-01', '2026-05-01'),
    ).resolves.toBeDefined();
    await expect(
      admin.listDays('2026-01-01', '2026-05-02'),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      admin.listDays('2026-02-01', '2026-01-01'),
    ).rejects.toMatchObject({ status: 400 });
    await expect(admin.listDays('nope')).rejects.toMatchObject({ status: 400 });
  });
});

describe('admin editorial rows', () => {
  it('upserts partially and keeps what was not sent', async () => {
    const { tmdb, admin, store } = build();
    tmdb.add(1);
    const first = await admin.upsertCandidate(
      1,
      { boost: 3.456, note: ' Retrospective ' },
      9,
    );
    expect(first).toMatchObject({
      tmdbPersonId: 1,
      boost: 3.46,
      blocked: false,
      note: 'Retrospective',
      updatedBy: 9,
      person: { id: 1, name: 'Person 1' },
    });
    const second = await admin.upsertCandidate(1, { blocked: true }, 10);
    expect(second).toMatchObject({
      boost: 3.46,
      blocked: true,
      note: 'Retrospective',
      updatedBy: 10,
    });
    const cleared = await admin.upsertCandidate(1, { note: '' }, 10);
    expect(cleared.note).toBeNull();
    expect(store.candidates).toHaveLength(1);
  });

  it('leaves existing days alone', async () => {
    const { tmdb, featured, admin, store } = build();
    seedPool(tmdb);
    const pick = (await featured.list()).data[0].person.id;
    await admin.upsertCandidate(pick, { blocked: true, boost: 0 }, 1);
    expect(store.rows[0].tmdbPersonId).toBe(pick);
  });

  it('answers 422 for a boost outside 0 to 10, a long note, an unknown person, or a photoless boost', async () => {
    const { tmdb, admin } = build();
    tmdb.add(1);
    tmdb.add(2, { photo: false });
    await expect(
      admin.upsertCandidate(1, { boost: 10.5 }, 1),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      admin.upsertCandidate(1, { boost: -1 }, 1),
    ).rejects.toMatchObject({
      status: 422,
    });
    await expect(
      admin.upsertCandidate(1, { note: 'x'.repeat(501) }, 1),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      admin.upsertCandidate(404, { boost: 2 }, 1),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      admin.upsertCandidate(2, { boost: 2 }, 1),
    ).rejects.toMatchObject({
      status: 422,
    });
    // Without a boost above 1 a photo is not needed to block someone.
    await expect(
      admin.upsertCandidate(2, { blocked: true }, 1),
    ).resolves.toBeDefined();
    await expect(
      admin.upsertCandidate(1, { boost: 0 }, 1),
    ).resolves.toBeDefined();
    await expect(
      admin.upsertCandidate(1, { boost: 10 }, 1),
    ).resolves.toBeDefined();
  });

  it('requires something to change', async () => {
    const { tmdb, admin } = build();
    tmdb.add(1);
    await expect(admin.upsertCandidate(1, {}, 1)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('lists with filters and pagination, people included', async () => {
    const { tmdb, admin } = build();
    for (const id of [1, 2, 3]) tmdb.add(id);
    await admin.upsertCandidate(1, { boost: 4 }, 1);
    await admin.upsertCandidate(2, { blocked: true }, 1);
    await admin.upsertCandidate(3, { boost: 2, blocked: true }, 1);
    const all = await admin.listCandidates({ page: 1, limit: 2 });
    expect(all.meta).toEqual({
      totalItems: 3,
      itemsPerPage: 2,
      currentPage: 1,
      totalPages: 2,
    });
    expect(all.data).toHaveLength(2);
    expect(all.data[0].person).toMatchObject({ name: expect.any(String) });
    const boosted = await admin.listCandidates({
      page: 1,
      limit: 10,
      boosted: true,
    });
    expect(boosted.data.map((row) => row.tmdbPersonId).sort()).toEqual([1, 3]);
    const plain = await admin.listCandidates({
      page: 1,
      limit: 10,
      boosted: false,
      blocked: true,
    });
    expect(plain.data.map((row) => row.tmdbPersonId)).toEqual([2]);
  });

  it('shows a row whose person TMDb no longer knows', async () => {
    const { tmdb, admin } = build();
    tmdb.add(1);
    await admin.upsertCandidate(1, { boost: 2 }, 1);
    tmdb.people.delete(1);
    const { data } = await admin.listCandidates({ page: 1, limit: 10 });
    expect(data[0]).toMatchObject({ tmdbPersonId: 1, person: null });
  });

  it('removes a row, or answers 404', async () => {
    const { tmdb, admin } = build();
    tmdb.add(1);
    await admin.upsertCandidate(1, { boost: 2 }, 1);
    await admin.removeCandidate(1, 1);
    await expect(admin.removeCandidate(1, 1)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('admin people tools', () => {
  it('searches with eligibility, editorial flags and the last featured day', async () => {
    const { tmdb, admin } = build();
    tmdb.add(1);
    tmdb.add(2, { photo: false });
    tmdb.add(3, { biography: '' });
    await admin.upsertCandidate(1, { boost: 2 }, 1);
    await admin.setDay(today(), { tmdbPersonId: 1 }, 1);
    const result = await admin.searchPeople('person', 1);
    expect(result.meta).toMatchObject({ currentPage: 1, itemsPerPage: 20 });
    expect(result.data).toEqual([
      expect.objectContaining({
        id: 1,
        eligible: true,
        boost: 2,
        blocked: false,
        lastFeaturedDate: today(),
      }),
      expect.objectContaining({
        id: 2,
        eligible: false,
        lastFeaturedDate: null,
      }),
      expect.objectContaining({ id: 3, eligible: false, boost: 1 }),
    ]);
    await expect(admin.searchPeople('   ', 1)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('previews score, boost, cooldown and weight, with reasons', async () => {
    const { tmdb, admin, store } = build();
    tmdb.add(1, { libraryFilms: 3 });
    tmdb.add(2, { films: 2 });
    store.candidates.push(
      Object.assign(new FeaturedCandidate(), {
        tmdbPersonId: 1,
        boost: 2,
        blocked: false,
      }),
    );
    const fresh = await admin.preview(1);
    expect(fresh).toMatchObject({
      editorialBoost: 2,
      cooldownFactor: 1,
      lastFeaturedDate: null,
      eligible: true,
      reasons: [],
    });
    expect(fresh.weight).toBeCloseTo(fresh.baseScore * 2, 10);
    expect(fresh).not.toHaveProperty('chancePercent');

    await admin.preview(2).then((preview) => {
      expect(preview.eligible).toBe(false);
      expect(preview.reasons).toEqual(['too_few_credits']);
    });

    // Featured 15 days ago: past the hard gap, halfway through the cooldown.
    store.rows.push({
      id: 1,
      featureDate: addDays(today(), -15),
      tmdbPersonId: 1,
      name: 'Person 1',
      profilePath: '/p1.jpg',
      knownForDepartment: null,
      tagline: null,
      source: 'auto',
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const cooling = await admin.preview(1);
    expect(cooling).toMatchObject({
      cooldownFactor: 0.5,
      eligible: true,
      lastFeaturedDate: addDays(today(), -15),
    });
    store.rows[0].featureDate = addDays(today(), -30);
    expect((await admin.preview(1)).cooldownFactor).toBe(1);
    store.rows[0].featureDate = addDays(today(), -3);
    expect(await admin.preview(1)).toMatchObject({
      eligible: false,
      reasons: ['featured_within_hard_gap'],
    });
    await expect(admin.preview(404)).rejects.toMatchObject({ status: 404 });
  });
});
