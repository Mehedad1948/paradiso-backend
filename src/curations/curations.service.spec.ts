/* eslint-disable @typescript-eslint/require-await -- the fake store mimics async queries */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../cache/cache.service';
import { ContentBlocksService } from '../movies/providers/content-blocks.service';
import { MovieDbService } from '../movies/providers/MovieDb.serviec';
import { CurationKey } from './curations.constants';
import { CurationsService } from './curations.service';
import {
  CurationsStore,
  CurationsTx,
  LibraryMovie,
  NewItem,
  StoredCuration,
} from './curations-store';

const SEEDED_AT = new Date('2026-10-01T00:00:00Z');
const ADMIN = { id: 7, username: 'editor' };

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const movie = (n: number, extra: Partial<LibraryMovie> = {}): LibraryMovie => ({
  id: id(n),
  dbId: 1000 + n,
  title: `Movie ${n}`,
  poster_path: `/poster-${n}.jpg`,
  release_date: '2000-01-01',
  ...extra,
});

interface StoredList {
  updatedAt: Date;
  updatedBy: number | null;
  items: NewItem[];
}

// An in-memory copy of the tables, with the one property that matters here:
// a transaction that throws leaves every list as it was.
class FakeStore {
  movies: LibraryMovie[] = [];
  lists: Record<CurationKey, StoredList> = {
    'landing-grid': { updatedAt: SEEDED_AT, updatedBy: null, items: [] },
    'editors-picks': { updatedAt: SEEDED_AT, updatedBy: null, items: [] },
  };
  transactions = 0;
  // Throws while inserting this many rows into the new list.
  failAfterInserting: number | null = null;

  async read(key: CurationKey): Promise<StoredCuration> {
    const list = this.lists[key];
    return {
      updatedAt: list.updatedAt,
      updatedBy: list.updatedBy === null ? null : ADMIN,
      items: [...list.items]
        .sort((a, b) => a.slot - b.slot)
        .map((item) => ({
          slot: item.slot,
          imageUrl: item.imageUrl,
          objectPosition: item.objectPosition,
          movie: this.movies.find((m) => m.id === item.movieId)!,
        })),
    };
  }

  async findMovie(movieId: string) {
    return this.movies.find((m) => m.id === movieId) ?? null;
  }

  async transaction<T>(work: (tx: CurationsTx) => Promise<T>): Promise<T> {
    this.transactions++;
    const before = structuredClone(this.lists);
    const tx: CurationsTx = {
      lock: async () => undefined,
      findMovies: async (ids) => this.movies.filter((m) => ids.includes(m.id)),
      replaceItems: async (key, items) => {
        this.lists[key].items = [];
        for (const item of items) {
          if (this.failAfterInserting === this.lists[key].items.length)
            throw new Error('connection lost');
          this.lists[key].items.push(item);
        }
      },
      touch: async (key, userId) => {
        this.lists[key].updatedAt = new Date('2026-10-29T10:00:00Z');
        this.lists[key].updatedBy = userId;
      },
    };
    try {
      return await work(tx);
    } catch (error) {
      this.lists = before;
      throw error;
    }
  }
}

describe('CurationsService', () => {
  let store: FakeStore;
  let blocked: Set<number>;
  let service: CurationsService;
  let posters: jest.Mock;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    store = new FakeStore();
    blocked = new Set();
    const blocks = {
      without: async <T>(
        _kind: string,
        items: T[],
        tmdbId: (item: T) => number | null | undefined,
      ) => items.filter((item) => !blocked.has(tmdbId(item) ?? -1)),
    } as unknown as ContentBlocksService;
    posters = jest.fn().mockResolvedValue([]);
    service = new CurationsService(
      store as unknown as CurationsStore,
      blocks,
      { getMoviePosters: posters } as unknown as MovieDbService,
      new CacheService(new ConfigService({})),
    );
    store.movies = [1, 2, 3, 4].map((n) => movie(n));
  });
  afterEach(() => jest.restoreAllMocks());

  const grid = (...cells: [number, number][]) => ({
    items: cells.map(([slot, n]) => ({ slot, movieId: id(n) })),
  });
  const slotsOf = (key: CurationKey) =>
    store.lists[key].items.map((item) => [item.slot, item.movieId]);

  describe('replacing the landing grid', () => {
    it('stores the cells, the same movie in several, and stamps the editor', async () => {
      const result = await service.replaceLandingGrid(
        {
          items: [
            {
              slot: 26,
              movieId: id(1),
              imageUrl: '/a.jpg',
              objectPosition: 'center 40%',
            },
            { slot: 0, movieId: id(1), imageUrl: 'https://cdn.test/b.jpg' },
            { slot: 5, movieId: id(2) },
          ],
        },
        ADMIN.id,
      );
      expect(result).toEqual({
        data: [
          expect.objectContaining({
            slot: 0,
            imageUrl: 'https://cdn.test/b.jpg',
            objectPosition: null,
          }),
          expect.objectContaining({
            slot: 5,
            imageUrl: null,
            objectPosition: null,
          }),
          expect.objectContaining({
            slot: 26,
            imageUrl: '/a.jpg',
            objectPosition: 'center 40%',
          }),
        ],
        updatedAt: new Date('2026-10-29T10:00:00Z'),
        updatedBy: ADMIN,
      });
      expect(result.data[0].movie).toEqual(movie(1));
      expect(result.data[2].movie).toEqual(movie(1));
    });

    it('replaces the whole previous list, and an empty list clears it', async () => {
      await service.replaceLandingGrid(grid([0, 1], [1, 2], [2, 3]), ADMIN.id);
      await service.replaceLandingGrid(grid([1, 4]), ADMIN.id);
      expect(slotsOf('landing-grid')).toEqual([[1, id(4)]]);
      const cleared = await service.replaceLandingGrid({ items: [] }, ADMIN.id);
      expect(cleared.data).toEqual([]);
      expect(cleared.updatedBy).toEqual(ADMIN);
    });

    it('does not touch the editors’ picks', async () => {
      await service.replaceEditorsPicks({ movieIds: [id(1)] }, ADMIN.id);
      await service.replaceLandingGrid(grid([0, 2]), ADMIN.id);
      expect(slotsOf('editors-picks')).toEqual([[0, id(1)]]);
    });

    it('rejects a repeated slot with 400 and saves nothing', async () => {
      await service.replaceLandingGrid(grid([0, 1]), ADMIN.id);
      store.transactions = 0;
      await expect(
        service.replaceLandingGrid(
          grid([3, 1], [4, 2], [3, 2], [4, 3]),
          ADMIN.id,
        ),
      ).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('3, 4') as string,
      });
      expect(store.transactions).toBe(0);
      expect(slotsOf('landing-grid')).toEqual([[0, id(1)]]);
    });

    it('rejects movies that are not in the library with 422, naming every one', async () => {
      await service.replaceLandingGrid(grid([0, 1]), ADMIN.id);
      await expect(
        service.replaceLandingGrid(grid([0, 2], [1, 98], [2, 99], [3, 98]), 99),
      ).rejects.toMatchObject({
        status: 422,
        message: `Movies not found in the library: ${id(98)}, ${id(99)}`,
      });
      expect(slotsOf('landing-grid')).toEqual([[0, id(1)]]);
      // Still stamped by the earlier save, not by the rejected one.
      expect(store.lists['landing-grid'].updatedBy).toBe(ADMIN.id);
    });

    it('accepts a movie without a poster, which the image can stand in for', async () => {
      store.movies.push(movie(5, { poster_path: null }));
      await expect(
        service.replaceLandingGrid(
          { items: [{ slot: 0, movieId: id(5), imageUrl: '/graded.jpg' }] },
          ADMIN.id,
        ),
      ).resolves.toMatchObject({ data: [{ slot: 0 }] });
    });

    it('is atomic: a failure halfway through keeps the old list and its stamp', async () => {
      await service.replaceLandingGrid(grid([0, 1], [1, 2]), ADMIN.id);
      const before = structuredClone(store.lists);
      store.failAfterInserting = 2;
      await expect(
        service.replaceLandingGrid(grid([5, 3], [6, 4], [7, 1]), 99),
      ).rejects.toThrow('connection lost');
      expect(store.lists).toEqual(before);
      expect(await service.adminLandingGrid()).toMatchObject({
        data: [{ slot: 0 }, { slot: 1 }],
        updatedBy: ADMIN,
      });
    });
  });

  describe("replacing the editors' picks", () => {
    it('stores the order as slots 0..n-1 and reads it back in that order', async () => {
      const result = await service.replaceEditorsPicks(
        { movieIds: [id(3), id(1), id(2)] },
        ADMIN.id,
      );
      expect(result.data.map((item) => item.movie.id)).toEqual([
        id(3),
        id(1),
        id(2),
      ]);
      expect(slotsOf('editors-picks')).toEqual([
        [0, id(3)],
        [1, id(1)],
        [2, id(2)],
      ]);
      expect(result.updatedBy).toEqual(ADMIN);
    });

    it('replaces the pool, and an empty pool is valid', async () => {
      await service.replaceEditorsPicks({ movieIds: [id(1), id(2)] }, ADMIN.id);
      await service.replaceEditorsPicks({ movieIds: [id(4)] }, ADMIN.id);
      expect(slotsOf('editors-picks')).toEqual([[0, id(4)]]);
      const cleared = await service.replaceEditorsPicks(
        { movieIds: [] },
        ADMIN.id,
      );
      expect(cleared.data).toEqual([]);
    });

    it('rejects a repeated movie with 400 and saves nothing', async () => {
      await expect(
        service.replaceEditorsPicks(
          { movieIds: [id(1), id(2), id(1)] },
          ADMIN.id,
        ),
      ).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining(id(1)) as string,
      });
      expect(store.transactions).toBe(0);
      expect(slotsOf('editors-picks')).toEqual([]);
    });

    it('rejects movies that are not in the library with 422, naming every one', async () => {
      await service.replaceEditorsPicks({ movieIds: [id(1)] }, ADMIN.id);
      await expect(
        service.replaceEditorsPicks(
          { movieIds: [id(2), id(97), id(98)] },
          ADMIN.id,
        ),
      ).rejects.toMatchObject({
        status: 422,
        message: `Movies not found in the library: ${id(97)}, ${id(98)}`,
      });
      expect(slotsOf('editors-picks')).toEqual([[0, id(1)]]);
    });

    it('rejects a movie without a poster with 422, naming it', async () => {
      store.movies.push(movie(5, { poster_path: null, title: 'No Poster' }));
      await expect(
        service.replaceEditorsPicks({ movieIds: [id(1), id(5)] }, ADMIN.id),
      ).rejects.toMatchObject({
        status: 422,
        message: expect.stringContaining(`No Poster (${id(5)})`) as string,
      });
      expect(slotsOf('editors-picks')).toEqual([]);
    });

    it('reports a missing movie before a posterless one', async () => {
      store.movies.push(movie(5, { poster_path: null }));
      await expect(
        service.replaceEditorsPicks({ movieIds: [id(5), id(99)] }, ADMIN.id),
      ).rejects.toMatchObject({
        message: expect.stringContaining('not found') as string,
      });
    });

    it('is atomic: a failure halfway through keeps the old pool and its stamp', async () => {
      await service.replaceEditorsPicks({ movieIds: [id(1), id(2)] }, ADMIN.id);
      const before = structuredClone(store.lists);
      store.failAfterInserting = 1;
      await expect(
        service.replaceEditorsPicks({ movieIds: [id(3), id(4)] }, 99),
      ).rejects.toThrow('connection lost');
      expect(store.lists).toEqual(before);
    });
  });

  describe("editors' pick covers", () => {
    const cover = 'https://image.tmdb.org/t/p/w500/alt.jpg';

    it('stores a pick cover and returns it, leaving other picks on their poster', async () => {
      const result = await service.replaceEditorsPicks(
        { items: [{ movieId: id(2), imageUrl: cover }, { movieId: id(1) }] },
        ADMIN.id,
      );
      expect(result.data.map((item) => item.imageUrl)).toEqual([cover, null]);
      expect(store.lists['editors-picks'].items[0]).toMatchObject({
        movieId: id(2),
        imageUrl: cover,
        objectPosition: null,
      });
    });

    it('accepts a movie without a poster when it has a cover', async () => {
      store.movies.push(movie(5, { poster_path: null }));
      const result = await service.replaceEditorsPicks(
        { items: [{ movieId: id(5), imageUrl: cover }] },
        ADMIN.id,
      );
      expect(result.data).toHaveLength(1);
    });

    it('still rejects a movie with neither a poster nor a cover', async () => {
      store.movies.push(movie(5, { poster_path: null }));
      await expect(
        service.replaceEditorsPicks({ items: [{ movieId: id(5) }] }, ADMIN.id),
      ).rejects.toThrow(/Movie 5/);
    });

    it('rejects repeated movies in items with 400', async () => {
      await expect(
        service.replaceEditorsPicks(
          { items: [{ movieId: id(1) }, { movieId: id(1), imageUrl: cover }] },
          ADMIN.id,
        ),
      ).rejects.toThrow(/repeated/);
    });

    it('rejects items together with movieIds', async () => {
      await expect(
        service.replaceEditorsPicks(
          { items: [{ movieId: id(1) }], movieIds: [id(1)] },
          ADMIN.id,
        ),
      ).rejects.toThrow('not both');
    });

    it('resets covers when the deprecated movieIds form is saved', async () => {
      await service.replaceEditorsPicks(
        { items: [{ movieId: id(1), imageUrl: cover }] },
        ADMIN.id,
      );
      const result = await service.replaceEditorsPicks(
        { movieIds: [id(1)] },
        ADMIN.id,
      );
      expect(result.data[0].imageUrl).toBeNull();
    });

    it('serves a pick that has a cover but no poster to the public', async () => {
      store.movies.push(movie(5, { poster_path: null }));
      await service.replaceEditorsPicks(
        { items: [{ movieId: id(5), imageUrl: cover }, { movieId: id(1) }] },
        ADMIN.id,
      );
      const result = await service.editorsPicks();
      expect(result.data.map((item) => item.movie.id)).toEqual([id(5), id(1)]);
    });

    describe('choosing a cover', () => {
      it('lists the TMDb posters best rated first, ready to save', async () => {
        posters.mockResolvedValue([
          {
            file_path: '/low.jpg',
            width: 1000,
            height: 1500,
            iso_639_1: 'en',
            vote_average: 3,
            vote_count: 2,
          },
          {
            file_path: '/poster-1.jpg',
            width: 2000,
            height: 3000,
            iso_639_1: null,
            vote_average: 5.5,
            vote_count: 9,
          },
        ]);
        const result = await service.moviePosters(id(1));
        expect(posters).toHaveBeenCalledWith(1001);
        expect(result.data.map((poster) => poster.imageUrl)).toEqual([
          'https://image.tmdb.org/t/p/w500/poster-1.jpg',
          'https://image.tmdb.org/t/p/w500/low.jpg',
        ]);
        expect(result.data[0]).toMatchObject({
          thumbnailUrl: 'https://image.tmdb.org/t/p/w185/poster-1.jpg',
          isDefault: true,
          language: null,
        });
        expect(result.data[1].isDefault).toBe(false);
      });

      it('keeps at most 30 posters', async () => {
        posters.mockResolvedValue(
          Array.from({ length: 45 }, (_, n) => ({
            file_path: `/p${n}.jpg`,
            width: 1,
            height: 1,
            iso_639_1: 'en',
            vote_average: n,
          })),
        );
        expect((await service.moviePosters(id(1))).data).toHaveLength(30);
      });

      it('is empty for a movie that did not come from TMDb, without asking TMDb', async () => {
        store.movies.push(movie(5, { dbId: null }));
        expect(await service.moviePosters(id(5))).toEqual({ data: [] });
        expect(posters).not.toHaveBeenCalled();
      });

      it('is 404 for a movie outside the library', async () => {
        await expect(service.moviePosters(id(99))).rejects.toThrow('not found');
      });
    });
  });

  describe('reading', () => {
    beforeEach(async () => {
      store.movies.push(
        movie(5, { poster_path: null }),
        movie(6, { poster_path: null }),
      );
      store.lists['landing-grid'] = {
        updatedAt: SEEDED_AT,
        updatedBy: ADMIN.id,
        items: [
          { slot: 9, movieId: id(2), imageUrl: null, objectPosition: null },
          {
            slot: 1,
            movieId: id(1),
            imageUrl: '/a.jpg',
            objectPosition: 'center',
          },
          {
            slot: 4,
            movieId: id(5),
            imageUrl: '/graded.jpg',
            objectPosition: null,
          },
          { slot: 6, movieId: id(6), imageUrl: null, objectPosition: null },
          { slot: 7, movieId: id(3), imageUrl: '/c.jpg', objectPosition: null },
        ],
      };
      store.lists['editors-picks'] = {
        updatedAt: SEEDED_AT,
        updatedBy: null,
        items: [
          { slot: 0, movieId: id(2), imageUrl: null, objectPosition: null },
          { slot: 1, movieId: id(6), imageUrl: null, objectPosition: null },
          { slot: 2, movieId: id(3), imageUrl: null, objectPosition: null },
        ],
      };
      blocked = new Set([movie(3).dbId!]);
    });

    it('serves the public grid sorted by slot, without cells that show nothing or are blocked', async () => {
      const result = await service.landingGrid();
      expect(result.data.map((cell) => cell.slot)).toEqual([1, 4, 9]);
      expect(result.data[0]).toEqual({
        slot: 1,
        imageUrl: '/a.jpg',
        objectPosition: 'center',
        movie: movie(1),
      });
      expect(result.updatedAt).toBe(SEEDED_AT);
      expect(result).not.toHaveProperty('updatedBy');
    });

    it('serves the public pool in order, without posterless or blocked movies', async () => {
      const result = await service.editorsPicks();
      expect(result.data).toEqual([{ movie: movie(2), imageUrl: null }]);
      expect(result).not.toHaveProperty('updatedBy');
    });

    it('serves the admin everything stored, with the editor', async () => {
      const gridResult = await service.adminLandingGrid();
      expect(gridResult.data.map((cell) => cell.slot)).toEqual([1, 4, 6, 7, 9]);
      expect(gridResult.updatedBy).toEqual(ADMIN);
      const picks = await service.adminEditorsPicks();
      expect(picks.data.map((item) => item.movie.id)).toEqual([
        id(2),
        id(6),
        id(3),
      ]);
      expect(picks.updatedBy).toBeNull();
    });
  });
});

describe('CurationsService public cache', () => {
  const kept = new Map<string, unknown>();
  const cache = {
    remember: async (
      key: string,
      _ttl: number,
      load: () => Promise<unknown>,
    ) => {
      if (!kept.has(key)) kept.set(key, await load());
      return kept.get(key);
    },
    delete: (key: string) => Promise.resolve(kept.delete(key)),
  } as unknown as CacheService;
  let store: FakeStore;
  let service: CurationsService;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    kept.clear();
    store = new FakeStore();
    store.movies = [1, 2].map((n) => movie(n));
    const blocks = {
      without: async <T>(_kind: string, items: T[]) => items,
    } as unknown as ContentBlocksService;
    service = new CurationsService(
      store as unknown as CurationsStore,
      blocks,
      {} as MovieDbService,
      cache,
    );
  });
  afterEach(() => jest.restoreAllMocks());

  it('reads a list once, then serves the kept answer', async () => {
    const read = jest.spyOn(store, 'read');
    await service.editorsPicks();
    await service.editorsPicks();
    await service.landingGrid();
    await service.landingGrid();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('forgets a list the moment an editor saves it', async () => {
    await expect(service.editorsPicks()).resolves.toMatchObject({ data: [] });
    await service.replaceEditorsPicks({ movieIds: [id(1)] }, ADMIN.id);
    const after = await service.editorsPicks();
    expect(after.data.map((pick) => pick.movie.id)).toEqual([id(1)]);
    await service.landingGrid();
    await service.replaceLandingGrid(
      { items: [{ slot: 0, movieId: id(2) }] },
      ADMIN.id,
    );
    const grid = await service.landingGrid();
    expect(grid.data.map((cell) => cell.movie.id)).toEqual([id(2)]);
  });
});
