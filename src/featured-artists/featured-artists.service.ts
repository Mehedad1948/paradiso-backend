import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PeopleService } from '../people/people.service';
import { FeaturedArtist } from './featured-artist.entity';
import { KnownForFilm, knownFor } from './featured-profile';
import { FeaturedSelectionService } from './featured-selection.service';
import { FeaturedStore } from './featured-store';
import { utcDate } from './utc-date';

// TMDb-derived data is kept this long per person.
export const DERIVED_TTL_MS = 6 * 60 * 60 * 1000;
const DERIVED_ENTRIES = 500;
// After a failed selection, requests serve the latest row instead of asking
// TMDb again for this long.
export const SELECTION_RETRY_MS = 60 * 1000;
export const MAX_LIMIT = 11;

export interface FeaturedPersonSummary {
  id: number;
  name: string;
  profile_path: string;
  knownForDepartment: string | null;
}

export interface FeaturedArtistItem {
  date: string;
  isToday: boolean;
  person: FeaturedPersonSummary;
  tagline: string | null;
  knownFor: KnownForFilm[];
  libraryFilmCount: number | null;
}

interface Derived {
  knownFor: KnownForFilm[];
  libraryFilmCount: number;
  storedAt: number;
}

export const toPersonSummary = (
  row: FeaturedArtist,
): FeaturedPersonSummary => ({
  id: row.tmdbPersonId,
  name: row.name,
  profile_path: row.profilePath,
  knownForDepartment: row.knownForDepartment,
});

// The public feed: today's artist and the days before it.
@Injectable()
export class FeaturedArtistsService {
  private readonly logger = new Logger(FeaturedArtistsService.name);
  // In-process, LRU by insertion; library counts move slowly enough for 6h.
  private readonly derived = new Map<number, Derived>();
  // Concurrent first requests of a day share one selection.
  private readonly selecting = new Map<string, Promise<void>>();
  private failed: { date: string; at: number } | null = null;

  constructor(
    private readonly store: FeaturedStore,
    private readonly selection: FeaturedSelectionService,
    private readonly people: PeopleService,
  ) {}

  async list(limit = MAX_LIMIT): Promise<{ data: FeaturedArtistItem[] }> {
    const today = utcDate();
    let rows = await this.store.listUpTo(today, limit);
    if (rows[0]?.featureDate !== today) {
      // Lazy fallback: the midnight job has not run, or failed. With nothing
      // at all to show, every request tries again.
      await this.fillToday(today, rows.length === 0);
      rows = await this.store.listUpTo(today, limit);
    }
    // No row at all: the only case where there is nothing to show.
    if (!rows.length)
      throw new ServiceUnavailableException(
        'The featured artist is not available yet',
      );
    // If today's pick could not be made, the newest row stands in for it
    // and gets the full treatment.
    const derived = await this.derivedFor(rows[0].tmdbPersonId);
    return {
      data: rows.map((row, index) => ({
        date: row.featureDate,
        isToday: row.featureDate === today,
        person: toPersonSummary(row),
        tagline: row.tagline,
        knownFor: index === 0 ? (derived?.knownFor ?? []) : [],
        libraryFilmCount:
          index === 0 ? (derived?.libraryFilmCount ?? null) : null,
      })),
    };
  }

  // Forget cached TMDb data, e.g. after an editor changes today's pick.
  invalidate(...personIds: (number | undefined)[]) {
    for (const id of personIds) if (id !== undefined) this.derived.delete(id);
  }

  @Cron('0 0 0 * * *', { name: 'featured-artist-of-the-day', timeZone: 'UTC' })
  async pickToday() {
    await this.fillToday(utcDate(), true);
  }

  // Never throws: a failed selection is logged as an alert and the feed
  // falls back to the latest row.
  private fillToday(today: string, force = false): Promise<void> {
    if (
      !force &&
      this.failed?.date === today &&
      Date.now() - this.failed.at < SELECTION_RETRY_MS
    )
      return Promise.resolve();
    let pending = this.selecting.get(today);
    if (!pending) {
      pending = this.selection
        .selectFor(today)
        .then(() => {
          this.failed = null;
        })
        .catch((error: unknown) => {
          this.failed = { date: today, at: Date.now() };
          this.logger.error(
            `ALERT: selecting the featured artist for ${today} failed; serving the latest existing pick: ${String(error)}`,
          );
        })
        .finally(() => this.selecting.delete(today));
      this.selecting.set(today, pending);
    }
    return pending;
  }

  private async derivedFor(personId: number): Promise<Derived | null> {
    const cached = this.derived.get(personId);
    if (cached && Date.now() - cached.storedAt < DERIVED_TTL_MS) {
      this.derived.delete(personId);
      this.derived.set(personId, cached);
      return cached;
    }
    try {
      const profile = await this.people.getPerson(personId);
      const { directing, acting, crew } = profile.credits;
      const libraryFilms = new Set(
        [...directing, ...acting, ...crew]
          .filter((film) => film.movieId !== null)
          .map((film) => film.tmdbId),
      );
      const entry = {
        knownFor: knownFor(profile),
        libraryFilmCount: libraryFilms.size,
        storedAt: Date.now(),
      };
      this.derived.delete(personId);
      this.derived.set(personId, entry);
      const oldest = this.derived.keys().next();
      if (this.derived.size > DERIVED_ENTRIES && !oldest.done)
        this.derived.delete(oldest.value);
      return entry;
    } catch (error) {
      // The card still renders from the stored snapshot.
      if (!(error instanceof NotFoundException))
        this.logger.warn(
          `Known-for lookup for #${personId} failed: ${String(error)}`,
        );
      return cached ?? null;
    }
  }
}
