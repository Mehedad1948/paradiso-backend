import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheService } from '../../cache/cache.service';
import { ContentBlock, ContentBlockKind } from '../content-block.entity';

// The table only changes when the audit script runs (which also clears this
// cache), so the whole list is kept instead of asking Neon on every request.
// Redis shares it between restarts; the in-memory copy saves even that trip,
// because one request often checks the list several times.
const BLOCKLIST_TTL_SECONDS = 5 * 60;
const MEMORY_TTL_MS = 30_000;

export const blocklistCacheKey = (kind: ContentBlockKind) =>
  `content-block:${kind}`;

@Injectable()
export class ContentBlocksService {
  private readonly memory = new Map<
    ContentBlockKind,
    { ids: Set<number>; loadedAt: number }
  >();

  constructor(
    @InjectRepository(ContentBlock)
    private readonly blocks: Repository<ContentBlock>,
    private readonly cache: CacheService,
  ) {}

  // Which of these TMDb IDs are blocked.
  async blocked(
    kind: ContentBlockKind,
    tmdbIds: number[],
  ): Promise<Set<number>> {
    const ids = [...new Set(tmdbIds.filter(Number.isSafeInteger))];
    if (!ids.length) return new Set();
    // Without Redis, ask Neon about just these IDs in one query, as before.
    if (!this.cache.enabled) return this.queryBlocked(kind, ids);
    const all = await this.allBlocked(kind);
    return new Set(ids.filter((id) => all.has(id)));
  }

  async isBlocked(kind: ContentBlockKind, tmdbId: number): Promise<boolean> {
    return (await this.blocked(kind, [tmdbId])).has(tmdbId);
  }

  // Keeps only items that are not blocked.
  async without<T>(
    kind: ContentBlockKind,
    items: T[],
    tmdbId: (item: T) => number | null | undefined,
  ): Promise<T[]> {
    const ids = items.map(tmdbId).filter((id): id is number => id != null);
    const blocked = await this.blocked(kind, ids);
    if (!blocked.size) return items;
    return items.filter((item) => {
      const id = tmdbId(item);
      return id == null || !blocked.has(id);
    });
  }

  private async allBlocked(kind: ContentBlockKind): Promise<Set<number>> {
    const held = this.memory.get(kind);
    if (held && Date.now() - held.loadedAt < MEMORY_TTL_MS) return held.ids;
    const stored = await this.cache.remember(
      blocklistCacheKey(kind),
      BLOCKLIST_TTL_SECONDS,
      async () => {
        const rows = await this.blocks
          .createQueryBuilder('block')
          .select('block.tmdbId', 'tmdbId')
          .where('block.kind = :kind', { kind })
          .getRawMany<{ tmdbId: number }>();
        return rows.map((row) => row.tmdbId);
      },
    );
    const ids = new Set(stored);
    this.memory.set(kind, { ids, loadedAt: Date.now() });
    return ids;
  }

  private async queryBlocked(
    kind: ContentBlockKind,
    ids: number[],
  ): Promise<Set<number>> {
    const rows = await this.blocks
      .createQueryBuilder('block')
      .select('block.tmdbId', 'tmdbId')
      .where('block.kind = :kind', { kind })
      .andWhere('block.tmdbId = ANY(:ids)', { ids })
      .getRawMany<{ tmdbId: number }>();
    return new Set(rows.map((row) => row.tmdbId));
  }
}
