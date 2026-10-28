import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Movie } from '../movies/movie.entity';
import {
  DEFAULT_LANGUAGE,
  MovieDbService,
  TmdbPerson,
} from '../movies/providers/MovieDb.serviec';
import {
  creditTmdbIds,
  PersonProfile,
  toPersonProfile,
  withLibraryIds,
} from './person-credits';

// Served as-is while fresh, served and refreshed in the background while
// stale, fetched again once expired.
export const PERSON_FRESH_MS = 24 * 60 * 60 * 1000;
export const PERSON_EXPIRED_MS = 7 * 24 * 60 * 60 * 1000;
// TMDb may add a person it does not know yet; ask again after this.
export const PERSON_NOT_FOUND_MS = 5 * 60 * 1000;
export const PERSON_CACHE_ENTRIES = 2000;

interface CacheEntry {
  // null: TMDb said the person does not exist.
  profile: PersonProfile | null;
  storedAt: number;
}

@Injectable()
export class PeopleService {
  private readonly logger = new Logger(PeopleService.name);
  // In-process LRU keyed by person and language. Library IDs are never
  // stored here: the library changes, so they are looked up per request.
  private readonly cache = new Map<string, CacheEntry>();
  // Concurrent misses and refreshes of one key share one TMDb request.
  private readonly pending = new Map<string, Promise<CacheEntry>>();

  constructor(
    @InjectRepository(Movie)
    private readonly movieRepository: Repository<Movie>,
    private readonly movieDbService: MovieDbService,
  ) {}

  async getPerson(
    personId: number,
    language = DEFAULT_LANGUAGE,
    now = Date.now(),
  ): Promise<PersonProfile> {
    const key = personId + ':' + language;
    let entry = this.cache.get(key);
    const age = entry ? now - entry.storedAt : Infinity;
    if (
      !entry ||
      age >= (entry.profile ? PERSON_EXPIRED_MS : PERSON_NOT_FOUND_MS)
    ) {
      // Failures propagate uncached; the next request asks TMDb again.
      entry = await this.load(key, personId, language);
    } else {
      this.touch(key, entry);
      if (entry.profile && age >= PERSON_FRESH_MS)
        // Keeps serving the stale copy if the refresh fails.
        this.load(key, personId, language).catch((error: unknown) =>
          this.logger.warn(`Refreshing person ${key} failed: ${String(error)}`),
        );
    }
    if (!entry.profile) throw new NotFoundException('Person not found');
    return withLibraryIds(
      entry.profile,
      await this.libraryIds(creditTmdbIds(entry.profile.credits)),
    );
  }

  private load(
    key: string,
    personId: number,
    language: string,
  ): Promise<CacheEntry> {
    let pending = this.pending.get(key);
    if (!pending) {
      pending = this.fetch(personId, language)
        .then((profile) => {
          const entry = { profile, storedAt: Date.now() };
          this.touch(key, entry);
          return entry;
        })
        .finally(() => this.pending.delete(key));
      this.pending.set(key, pending);
    }
    return pending;
  }

  private async fetch(
    personId: number,
    language: string,
  ): Promise<PersonProfile | null> {
    let person: TmdbPerson;
    try {
      person = await this.movieDbService.getPerson(personId, language);
    } catch (error) {
      if (error instanceof NotFoundException) return null;
      throw error;
    }
    // Adult performers stay hidden, like adult titles in search.
    if (person.adult) return null;
    let biography = person.biography?.trim() ?? '';
    if (!biography && language !== DEFAULT_LANGUAGE)
      biography =
        (await this.movieDbService.getPersonProfile(personId, DEFAULT_LANGUAGE))
          .biography ?? '';
    return toPersonProfile(person, biography);
  }

  // Map order is recency: re-inserting marks a key as recently used.
  private touch(key: string, entry: CacheEntry) {
    this.cache.delete(key);
    this.cache.set(key, entry);
    const oldest = this.cache.keys().next();
    if (this.cache.size > PERSON_CACHE_ENTRIES && !oldest.done)
      this.cache.delete(oldest.value);
  }

  // One query for every credit, however long the filmography.
  private async libraryIds(tmdbIds: number[]): Promise<Map<number, string>> {
    if (!tmdbIds.length) return new Map();
    const movies = await this.movieRepository
      .createQueryBuilder('movie')
      .select(['movie.id', 'movie.dbId'])
      .where('movie.dbId = ANY(:tmdbIds)', { tmdbIds })
      .getMany();
    return new Map(movies.map((movie) => [movie.dbId!, movie.id]));
  }
}
