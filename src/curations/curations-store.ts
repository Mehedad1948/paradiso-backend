import {
  Injectable,
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { Movie } from '../movies/movie.entity';
import { CurationItem } from './curation-item.entity';
import { Curation } from './curation.entity';
import { CurationKey } from './curations.constants';

// The movie fields a list shows. Whole movies are never loaded for a list.
export interface LibraryMovie {
  id: string;
  dbId: number | null;
  title: string;
  poster_path: string | null;
  release_date: string | null;
}

export interface StoredItem {
  slot: number;
  imageUrl: string | null;
  objectPosition: string | null;
  movie: LibraryMovie;
}

export interface StoredCuration {
  updatedAt: Date;
  updatedBy: { id: number; username: string } | null;
  // Slot ascending.
  items: StoredItem[];
}

export interface NewItem {
  slot: number;
  movieId: string;
  imageUrl: string | null;
  objectPosition: string | null;
}

// What a replace may do, all inside one database transaction.
export interface CurationsTx {
  // Serializes concurrent saves of one list.
  lock(key: CurationKey): Promise<void>;
  findMovies(ids: string[]): Promise<LibraryMovie[]>;
  replaceItems(key: CurationKey, items: NewItem[]): Promise<void>;
  touch(key: CurationKey, userId: number): Promise<void>;
}

const FOREIGN_KEY_VIOLATION = '23503';

const missingRow = (key: CurationKey) =>
  new InternalServerErrorException(
    `Curation "${key}" does not exist; run the curations migration`,
  );

// Every query the feature makes. The service holds the rules; keeping the SQL
// here lets its tests run against an in-memory copy.
@Injectable()
export class CurationsStore {
  constructor(
    @InjectRepository(Curation)
    private readonly curations: Repository<Curation>,
    @InjectRepository(CurationItem)
    private readonly items: Repository<CurationItem>,
    private readonly dataSource: DataSource,
  ) {}

  async read(key: CurationKey): Promise<StoredCuration> {
    const curation = await this.curations
      .createQueryBuilder('curation')
      .leftJoin('curation.updatedBy', 'editor')
      .addSelect(['editor.id', 'editor.username'])
      .where('curation.key = :key', { key })
      .getOne();
    if (!curation) throw missingRow(key);
    const rows = await this.items
      .createQueryBuilder('item')
      .innerJoin('item.movie', 'movie')
      .addSelect([
        'movie.id',
        'movie.dbId',
        'movie.title',
        'movie.poster_path',
        'movie.release_date',
      ])
      .where('item.curationKey = :key', { key })
      .orderBy('item.slot', 'ASC')
      .getMany();
    return {
      updatedAt: curation.updatedAt,
      updatedBy: curation.updatedBy && {
        id: curation.updatedBy.id,
        username: curation.updatedBy.username,
      },
      items: rows.map((row) => ({
        slot: row.slot,
        imageUrl: row.imageUrl,
        objectPosition: row.objectPosition,
        movie: toLibraryMovie(row.movie),
      })),
    };
  }

  async findMovie(id: string): Promise<LibraryMovie | null> {
    const movie = await this.dataSource
      .getRepository(Movie)
      .createQueryBuilder('movie')
      .select([
        'movie.id',
        'movie.dbId',
        'movie.title',
        'movie.poster_path',
        'movie.release_date',
      ])
      .where('movie.id = :id', { id })
      .getOne();
    return movie ? toLibraryMovie(movie) : null;
  }

  // Commits when `work` resolves and rolls everything back when it throws.
  transaction<T>(work: (tx: CurationsTx) => Promise<T>): Promise<T> {
    return this.dataSource
      .transaction(async (manager) =>
        work({
          lock: async (key) => {
            const row = await manager
              .getRepository(Curation)
              .createQueryBuilder('curation')
              .select('curation.key')
              .where('curation.key = :key', { key })
              .setLock('pessimistic_write')
              .getOne();
            if (!row) throw missingRow(key);
          },
          findMovies: async (ids) => {
            if (!ids.length) return [];
            const movies = await manager
              .getRepository(Movie)
              .createQueryBuilder('movie')
              .select([
                'movie.id',
                'movie.dbId',
                'movie.title',
                'movie.poster_path',
                'movie.release_date',
              ])
              .where('movie.id IN (:...ids)', { ids })
              .getMany();
            return movies.map(toLibraryMovie);
          },
          replaceItems: async (key, items) => {
            const repo = manager.getRepository(CurationItem);
            await repo.delete({ curationKey: key });
            if (items.length)
              await repo.insert(
                items.map((item) => ({ curationKey: key, ...item })),
              );
          },
          touch: async (key, userId) => {
            await manager
              .getRepository(Curation)
              .update(
                { key },
                { updatedAt: () => 'now()', updatedById: userId },
              );
          },
        }),
      )
      .catch((error: unknown) => {
        // A movie deleted between the check and the insert.
        if (
          error instanceof QueryFailedError &&
          (error.driverError as { code?: string }).code ===
            FOREIGN_KEY_VIOLATION
        )
          throw new UnprocessableEntityException(
            'A movie was removed from the library while saving; reload the list and try again',
          );
        throw error;
      });
  }
}

const toLibraryMovie = (movie: Movie): LibraryMovie => ({
  id: movie.id,
  dbId: movie.dbId ?? null,
  title: movie.title,
  poster_path: movie.poster_path ?? null,
  release_date: movie.release_date ?? null,
});
