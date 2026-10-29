import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MovieDbService } from '../movies/providers/MovieDb.serviec';
import { PeopleService } from '../people/people.service';
import { FeaturedArtist } from './featured-artist.entity';
import { FeaturedCandidate } from './featured-candidate.entity';
import { FEATURED_CONFIG, FeaturedConfig } from './featured-config';
import { gapByPerson, signalsOf } from './featured-profile';
import {
  Candidate,
  cooldownFactor,
  Random,
  weighEligible,
  weightedPick,
  weightedSample,
} from './featured-scoring';
import { FeaturedStore } from './featured-store';
import { addDays, daysBetween } from './utc-date';

// People credited on the most library films that enter the pool.
const LIBRARY_POOL_SIZE = 200;

interface PoolEntry {
  tmdbPersonId: number;
  // From TMDb's popular list; unknown for people found in the library.
  popularity: number | null;
  libraryFilms: number;
  // False when a popular-list row already shows there is no photo.
  hasPhoto: boolean;
}

const asError = (value: unknown) =>
  value instanceof Error ? value : new Error(String(value));

export class NoEligibleArtistError extends Error {
  constructor() {
    super('No eligible artist for the featured pick');
  }
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

// Picks the artist for a day: builds a pool, drops people who cannot or may
// not be featured, weighs the rest and draws one.
@Injectable()
export class FeaturedSelectionService {
  private readonly logger = new Logger(FeaturedSelectionService.name);

  constructor(
    private readonly store: FeaturedStore,
    private readonly people: PeopleService,
    private readonly movieDb: MovieDbService,
    @Inject(FEATURED_CONFIG) private readonly config: FeaturedConfig,
  ) {}

  // Days from `date` to each person's nearest appearance in the window that
  // matters for the hard gap and the cooldown.
  async gapsAround(date: string): Promise<Map<number, number>> {
    const reach = Math.max(
      this.config.cooldownDays,
      this.config.hardMinGapDays,
    );
    const appearances = await this.store.appearances(
      addDays(date, -reach),
      addDays(date, reach),
    );
    return gapByPerson(appearances, (featureDate) =>
      daysBetween(date, featureDate),
    );
  }

  // The ranking inputs for one person; null when TMDb does not know them or
  // the site hides them. Other TMDb failures propagate.
  async candidateFor(
    tmdbPersonId: number,
    gapDays: number | null,
    editorial: FeaturedCandidate | null,
  ): Promise<Candidate | null> {
    try {
      const { profile, popularity } =
        await this.people.getRankingProfile(tmdbPersonId);
      return {
        tmdbPersonId,
        name: profile.name,
        profilePath: profile.profile_path,
        knownForDepartment: profile.knownForDepartment,
        biography: profile.biography,
        signals: signalsOf(profile, popularity),
        boost: editorial?.boost ?? 1,
        blocked: editorial?.blocked ?? false,
        gapDays,
      };
    } catch (error) {
      if (error instanceof NotFoundException) return null;
      throw error;
    }
  }

  // Creates the automatic pick for `date`, or returns the row that is there.
  // Safe to call from several instances at once: the unique date decides.
  async selectFor(
    date: string,
    random: Random = Math.random,
  ): Promise<FeaturedArtist> {
    const existing = await this.store.findByDate(date);
    if (existing) return existing;

    const [gaps, editorial] = await Promise.all([
      this.gapsAround(date),
      this.store.allCandidates(),
    ]);
    const editorialById = new Map(
      editorial.map((row) => [row.tmdbPersonId, row]),
    );
    const pool = await this.pool(editorial);
    const shortlist = this.shortlist(pool, gaps, editorialById, random);
    let failure: unknown = null;
    const loaded = await mapLimit(
      shortlist,
      this.config.fetchConcurrency,
      async (entry) => {
        try {
          return await this.candidateFor(
            entry.tmdbPersonId,
            gaps.get(entry.tmdbPersonId) ?? null,
            editorialById.get(entry.tmdbPersonId) ?? null,
          );
        } catch (error) {
          failure ??= error;
          return null;
        }
      },
    );
    const candidates = loaded.filter((c): c is Candidate => c !== null);
    // Every lookup failing means TMDb is down, not that nobody qualifies.
    if (!candidates.length && failure) throw asError(failure);
    const weighted = weighEligible(candidates, this.config);
    const winner = weightedPick(weighted, random);
    if (!winner) throw new NoEligibleArtistError();

    const { candidate } = winner;
    await this.store.insertIfAbsent({
      featureDate: date,
      tmdbPersonId: candidate.tmdbPersonId,
      name: candidate.name,
      profilePath: candidate.profilePath!,
      knownForDepartment: candidate.knownForDepartment,
      tagline: null,
      source: 'auto',
      createdBy: null,
    });
    // Another instance may have won the race; its row is the day's pick.
    const row = await this.store.findByDate(date);
    if (!row) throw new Error('Featured pick vanished after insert');
    const top = weighted
      .slice(0, 5)
      .map(
        (item) =>
          `${item.candidate.name} #${item.candidate.tmdbPersonId} ${item.weight.toFixed(4)}`,
      )
      .join(', ');
    this.logger.log(
      `${date}: picked ${row.name} #${row.tmdbPersonId}` +
        (row.tmdbPersonId === candidate.tmdbPersonId
          ? ` (weight ${winner.weight.toFixed(4)})`
          : ' (another instance won the draw)') +
        `; considered ${candidates.length} of ${pool.length} pooled, ` +
        `${weighted.length} eligible; top 5: ${top}`,
    );
    return row;
  }

  // Library people, TMDb's popular people and boosted candidates, merged.
  private async pool(editorial: FeaturedCandidate[]): Promise<PoolEntry[]> {
    const entries = new Map<number, PoolEntry>();
    const entry = (tmdbPersonId: number) => {
      let known = entries.get(tmdbPersonId);
      if (!known) {
        known = {
          tmdbPersonId,
          popularity: null,
          libraryFilms: 0,
          hasPhoto: true,
        };
        entries.set(tmdbPersonId, known);
      }
      return known;
    };
    const pages = Array.from(
      { length: this.config.popularPages },
      (_, index) => index + 1,
    );
    let failure: unknown = null;
    const [library, ...popular] = await Promise.allSettled([
      this.store.libraryPeople(LIBRARY_POOL_SIZE),
      ...pages.map((page) => this.movieDb.getPopularPeople(page)),
    ]);
    if (library.status === 'fulfilled') {
      for (const { tmdbPersonId, films } of library.value)
        entry(tmdbPersonId).libraryFilms = films;
    } else {
      failure = library.reason;
      this.logger.warn(`Library pool failed: ${String(library.reason)}`);
    }
    for (const result of popular) {
      if (result.status === 'rejected') {
        failure ??= result.reason;
        this.logger.warn(`Popular people failed: ${String(result.reason)}`);
        continue;
      }
      for (const person of result.value.results) {
        if (person.adult) continue;
        const known = entry(person.id);
        known.popularity = person.popularity ?? null;
        known.hasPhoto = !!person.profile_path;
      }
    }
    for (const row of editorial)
      if (row.boost > 1 && !row.blocked) entry(row.tmdbPersonId);
    // An empty pool because a source failed is an outage, not "nobody fits".
    if (!entries.size && failure) throw asError(failure);
    return [...entries.values()];
  }

  // Loading a profile costs a TMDb request, so only a sample of the pool is
  // loaded. Sampling uses the same ingredients as the final weight, so the
  // odds of a person being looked at follow the odds of them being picked.
  private shortlist(
    pool: PoolEntry[],
    gaps: Map<number, number>,
    editorial: Map<number, FeaturedCandidate>,
    random: Random,
  ): PoolEntry[] {
    const weighted = pool
      .filter((entry) => {
        const row = editorial.get(entry.tmdbPersonId);
        const gap = gaps.get(entry.tmdbPersonId);
        return (
          entry.hasPhoto &&
          !row?.blocked &&
          (gap === undefined || gap >= this.config.hardMinGapDays)
        );
      })
      .map((entry) => ({
        entry,
        weight:
          (0.1 +
            Math.min(1, entry.libraryFilms / 3) +
            Math.min(1, (entry.popularity ?? 0) / 50)) *
          (editorial.get(entry.tmdbPersonId)?.boost ?? 1) *
          cooldownFactor(
            gaps.get(entry.tmdbPersonId) ?? null,
            this.config.cooldownDays,
          ),
      }))
      .filter((item) => item.weight > 0);
    return weightedSample(weighted, this.config.shortlistSize, random).map(
      (item) => item.entry,
    );
  }
}
