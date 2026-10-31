import { Repository } from 'typeorm';
import { CacheService } from '../../cache/cache.service';
import { ContentBlock } from '../content-block.entity';
import { ContentBlocksService } from './content-blocks.service';

// A repository whose query builder answers from `rows` and counts queries.
function fakeRepository(rows: { kind: string; tmdbId: number }[]) {
  const queries: { kind: string; ids?: number[] }[] = [];
  const repository = {
    createQueryBuilder: () => {
      const query: { kind: string; ids?: number[] } = { kind: '' };
      const builder = {
        select: () => builder,
        where: (_sql: string, params: { kind: string }) => {
          query.kind = params.kind;
          return builder;
        },
        andWhere: (_sql: string, params: { ids: number[] }) => {
          query.ids = params.ids;
          return builder;
        },
        getRawMany: () => {
          queries.push(query);
          return Promise.resolve(
            rows
              .filter(
                (row) =>
                  row.kind === query.kind &&
                  (!query.ids || query.ids.includes(row.tmdbId)),
              )
              .map(({ tmdbId }) => ({ tmdbId })),
          );
        },
      };
      return builder;
    },
  } as unknown as Repository<ContentBlock>;
  return { repository, queries };
}

// Remembers like Redis would; `enabled` switches the cache on or off.
function fakeCache(enabled: boolean) {
  const kept = new Map<string, unknown>();
  return {
    enabled,
    remember: async (
      key: string,
      _ttl: number,
      load: () => Promise<unknown>,
    ) => {
      if (!kept.has(key)) kept.set(key, await load());
      return kept.get(key);
    },
  } as unknown as CacheService;
}

const rows = [
  { kind: 'movie', tmdbId: 10 },
  { kind: 'movie', tmdbId: 11 },
  { kind: 'person', tmdbId: 10 },
];

describe('ContentBlocksService with the cache on', () => {
  it('reads the whole list once and answers later checks from memory', async () => {
    const { repository, queries } = fakeRepository(rows);
    const service = new ContentBlocksService(repository, fakeCache(true));
    await expect(service.blocked('movie', [10, 12])).resolves.toEqual(
      new Set([10]),
    );
    await expect(service.isBlocked('movie', 11)).resolves.toBe(true);
    await expect(service.isBlocked('movie', 99)).resolves.toBe(false);
    expect(queries).toHaveLength(1);
    expect(queries[0].ids).toBeUndefined();
  });

  it('keeps movies and people apart', async () => {
    const { repository } = fakeRepository(rows);
    const service = new ContentBlocksService(repository, fakeCache(true));
    await expect(service.isBlocked('movie', 11)).resolves.toBe(true);
    await expect(service.isBlocked('person', 11)).resolves.toBe(false);
  });

  it('drops blocked items from a list and skips empty questions', async () => {
    const { repository, queries } = fakeRepository(rows);
    const service = new ContentBlocksService(repository, fakeCache(true));
    const items = [{ id: 10 }, { id: 12 }, { id: null }];
    await expect(
      service.without('movie', items, (item) => item.id),
    ).resolves.toEqual([{ id: 12 }, { id: null }]);
    await expect(service.blocked('movie', [])).resolves.toEqual(new Set());
    expect(queries).toHaveLength(1);
  });
});

describe('ContentBlocksService with the cache off', () => {
  it('asks Neon about just the IDs in question, every time', async () => {
    const { repository, queries } = fakeRepository(rows);
    const service = new ContentBlocksService(repository, fakeCache(false));
    await expect(service.blocked('movie', [10, 12])).resolves.toEqual(
      new Set([10]),
    );
    await service.blocked('movie', [11]);
    expect(queries.map((query) => query.ids)).toEqual([[10, 12], [11]]);
  });
});
