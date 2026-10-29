import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContentBlock, ContentBlockKind } from '../content-block.entity';

@Injectable()
export class ContentBlocksService {
  constructor(
    @InjectRepository(ContentBlock)
    private readonly blocks: Repository<ContentBlock>,
  ) {}

  // Which of these TMDb IDs are blocked, in one query.
  async blocked(
    kind: ContentBlockKind,
    tmdbIds: number[],
  ): Promise<Set<number>> {
    const ids = [...new Set(tmdbIds.filter(Number.isSafeInteger))];
    if (!ids.length) return new Set();
    const rows = await this.blocks
      .createQueryBuilder('block')
      .select('block.tmdbId', 'tmdbId')
      .where('block.kind = :kind', { kind })
      .andWhere('block.tmdbId = ANY(:ids)', { ids })
      .getRawMany<{ tmdbId: number }>();
    return new Set(rows.map((row) => row.tmdbId));
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
}
