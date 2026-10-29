import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { MovieDbService } from '../movies/providers/MovieDb.serviec';
import { PeopleService } from '../people/people.service';
import { PersonProfile } from '../people/person-credits';
import {
  FeaturedPersonSummary,
  FeaturedArtistsService,
  toPersonSummary,
} from './featured-artists.service';
import {
  ListFeaturedCandidatesDto,
  MAX_BOOST,
  MAX_NOTE,
  MAX_TAGLINE,
  SetFeaturedArtistRequest,
  UpsertFeaturedCandidateRequest,
} from './featured-artists.dto';
import { FeaturedArtist } from './featured-artist.entity';
import { FeaturedCandidate } from './featured-candidate.entity';
import { FEATURED_CONFIG, FeaturedConfig } from './featured-config';
import { ineligibleReasons, PersonSignals, weigh } from './featured-scoring';
import { FeaturedSelectionService } from './featured-selection.service';
import { FeaturedStore } from './featured-store';
import { addDays, daysBetween, isUtcDate, utcDate } from './utc-date';

export const MAX_RANGE_DAYS = 120;
const DEFAULT_RANGE_DAYS = 30;
const SEARCH_PAGE_SIZE = 20;
const CANDIDATE_LOOKUPS = 5;

export interface AdminFeaturedArtistItem {
  date: string;
  person: FeaturedPersonSummary;
  tagline: string | null;
  source: 'auto' | 'manual';
  createdBy: number | null;
  createdAt: Date;
}

export interface FeaturedCandidateItem {
  tmdbPersonId: number;
  boost: number;
  blocked: boolean;
  note: string | null;
  updatedBy: number;
  updatedAt: Date;
  // null when TMDb no longer returns the person.
  person:
    | (Omit<FeaturedPersonSummary, 'profile_path'> & {
        profile_path: string | null;
      })
    | null;
}

const toAdminItem = (row: FeaturedArtist): AdminFeaturedArtistItem => ({
  date: row.featureDate,
  person: toPersonSummary(row),
  tagline: row.tagline,
  source: row.source,
  createdBy: row.createdBy,
  createdAt: row.createdAt,
});

function requireDate(value: string, name = 'date'): string {
  if (!isUtcDate(value))
    throw new BadRequestException(`${name} must be a date as YYYY-MM-DD`);
  return value;
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

// What editors of the site can do to the featured artist: schedule days,
// boost or block people, and see why somebody is or is not being picked.
@Injectable()
export class FeaturedAdminService {
  private readonly logger = new Logger(FeaturedAdminService.name);

  constructor(
    private readonly store: FeaturedStore,
    private readonly featured: FeaturedArtistsService,
    private readonly selection: FeaturedSelectionService,
    private readonly people: PeopleService,
    private readonly movieDb: MovieDbService,
    @Inject(FEATURED_CONFIG) private readonly config: FeaturedConfig,
  ) {}

  // ---- Days ----

  async listDays(from?: string, to?: string) {
    const today = utcDate();
    const start = requireDate(
      from ?? addDays(today, -DEFAULT_RANGE_DAYS),
      'from',
    );
    const end = requireDate(to ?? addDays(today, DEFAULT_RANGE_DAYS), 'to');
    if (daysBetween(start, end) < 0)
      throw new BadRequestException('from must not be after to');
    if (daysBetween(start, end) > MAX_RANGE_DAYS)
      throw new BadRequestException(
        `The range must be at most ${MAX_RANGE_DAYS} days`,
      );
    const rows = await this.store.range(start, end);
    return { from: start, to: end, data: rows.map(toAdminItem) };
  }

  async getDay(date: string) {
    const row = await this.store.findByDate(requireDate(date));
    if (!row) throw new NotFoundException('No featured artist for that day');
    return toAdminItem(row);
  }

  // An editor's decision wins: no cooldown, no gap, no block checks.
  async setDay(date: string, dto: SetFeaturedArtistRequest, adminId: number) {
    this.requireNotPast(requireDate(date));
    const tagline = this.tagline(dto.tagline);
    const { profile } = await this.requireFeaturable(dto.tmdbPersonId);
    const previous = await this.store.findByDate(date);
    await this.store.replace({
      featureDate: date,
      tmdbPersonId: profile.id,
      name: profile.name,
      profilePath: profile.profile_path!,
      knownForDepartment: profile.knownForDepartment,
      tagline,
      source: 'manual',
      createdBy: adminId,
    });
    if (date === utcDate())
      this.featured.invalidate(previous?.tmdbPersonId, profile.id);
    this.logger.log(
      `Manual pick for ${date}: #${profile.id} by user ${adminId}`,
    );
    return this.getDay(date);
  }

  async removeDay(date: string, adminId: number) {
    this.requireNotPast(requireDate(date));
    const previous = await this.store.findByDate(date);
    if (!previous || !(await this.store.deleteByDate(date)))
      throw new NotFoundException('No featured artist for that day');
    // A removed row for today is refilled by the next public request.
    if (date === utcDate()) this.featured.invalidate(previous.tmdbPersonId);
    this.logger.log(`Removed the pick for ${date} by user ${adminId}`);
  }

  // ---- Editorial rows ----

  async listCandidates(query: ListFeaturedCandidatesDto) {
    const limit = query.limit ?? 10;
    const page = query.page ?? 1;
    const { rows, total } = await this.store.pageCandidates({
      boosted: query.boosted,
      blocked: query.blocked,
      page,
      limit,
    });
    const data = await mapLimit(rows, CANDIDATE_LOOKUPS, (row) =>
      this.candidateItem(row),
    );
    return {
      data,
      meta: {
        totalItems: total,
        itemsPerPage: limit,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async upsertCandidate(
    tmdbPersonId: number,
    dto: UpsertFeaturedCandidateRequest,
    adminId: number,
  ) {
    if (
      dto.boost === undefined &&
      dto.blocked === undefined &&
      dto.note === undefined
    )
      throw new BadRequestException(
        'Send at least one of boost, blocked, note',
      );
    if (dto.boost !== undefined && (dto.boost < 0 || dto.boost > MAX_BOOST))
      throw new UnprocessableEntityException(
        `boost must be between 0 and ${MAX_BOOST}`,
      );
    const note = dto.note?.trim();
    if (note !== undefined && note.length > MAX_NOTE)
      throw new UnprocessableEntityException(
        `note must be at most ${MAX_NOTE} characters`,
      );
    const { profile } = await this.requirePerson(tmdbPersonId);
    const existing = await this.store.findCandidate(tmdbPersonId);
    const boost =
      dto.boost !== undefined
        ? Math.round(dto.boost * 100) / 100
        : (existing?.boost ?? 1);
    if (boost > 1 && !profile.profile_path)
      throw new UnprocessableEntityException(
        'A person needs a photo to be boosted',
      );
    const saved = await this.store.saveCandidate(
      Object.assign(new FeaturedCandidate(), {
        tmdbPersonId,
        boost,
        blocked: dto.blocked ?? existing?.blocked ?? false,
        note: note === undefined ? (existing?.note ?? null) : note || null,
        updatedBy: adminId,
      }),
    );
    this.logger.log(
      `Editorial row for #${tmdbPersonId} (boost ${saved.boost}, blocked ${saved.blocked}) set by user ${adminId}`,
    );
    return this.candidateItem(saved);
  }

  async removeCandidate(tmdbPersonId: number, adminId: number) {
    if (!(await this.store.deleteCandidate(tmdbPersonId)))
      throw new NotFoundException('No editorial row for that person');
    this.logger.log(
      `Editorial row for #${tmdbPersonId} removed by user ${adminId}`,
    );
  }

  // ---- Finding people ----

  async searchPeople(query: string, page: number) {
    const text = query.trim();
    if (!text) throw new BadRequestException('query must not be empty');
    const found = await this.movieDb.searchPeople(text, page);
    const hits = found.results.filter((person) => !person.adult);
    const ids = hits.map((person) => person.id);
    const [editorial, last, eligible] = await Promise.all([
      this.store.findCandidates(ids),
      this.store.lastFeatured(ids, utcDate()),
      mapLimit(hits, this.config.fetchConcurrency, (person) =>
        this.hasPhotoAndBiography(person.id, !!person.profile_path),
      ),
    ]);
    const editorialById = new Map(
      editorial.map((row) => [row.tmdbPersonId, row]),
    );
    const totalPages = Math.min(found.total_pages, 500);
    return {
      data: hits.map((person, index) => ({
        id: person.id,
        name: person.name,
        profile_path: person.profile_path ?? null,
        knownForDepartment: person.known_for_department ?? null,
        popularity: person.popularity ?? 0,
        eligible: eligible[index],
        boost: editorialById.get(person.id)?.boost ?? 1,
        blocked: editorialById.get(person.id)?.blocked ?? false,
        lastFeaturedDate: last.get(person.id) ?? null,
      })),
      meta: {
        totalItems: found.total_results,
        itemsPerPage: SEARCH_PAGE_SIZE,
        currentPage: page,
        totalPages,
      },
    };
  }

  // The numbers behind the next automatic draw, for one person. The chance
  // against the rest of the pool is left out: it needs the whole pool's
  // profiles from TMDb, which is not cheap.
  async preview(tmdbPersonId: number) {
    const today = utcDate();
    const [gaps, editorial, last] = await Promise.all([
      this.selection.gapsAround(today),
      this.store.findCandidate(tmdbPersonId),
      this.store.lastFeatured([tmdbPersonId], today),
    ]);
    const candidate = await this.selection.candidateFor(
      tmdbPersonId,
      gaps.get(tmdbPersonId) ?? null,
      editorial,
    );
    if (!candidate) throw new NotFoundException('Person not found');
    const reasons = ineligibleReasons(candidate, this.config);
    const weighted = weigh(candidate, this.config);
    const signals: PersonSignals = candidate.signals;
    return {
      person: {
        id: candidate.tmdbPersonId,
        name: candidate.name,
        profile_path: candidate.profilePath,
        knownForDepartment: candidate.knownForDepartment,
      },
      baseScore: weighted.baseScore,
      editorialBoost: weighted.editorialBoost,
      cooldownFactor: weighted.cooldownFactor,
      weight: weighted.weight,
      lastFeaturedDate: last.get(tmdbPersonId) ?? null,
      eligible: reasons.length === 0,
      reasons,
      signals,
    };
  }

  // ---- Helpers ----

  private requireNotPast(date: string) {
    if (date < utcDate())
      throw new ConflictException('Past days can no longer be changed');
  }

  private tagline(value: string | undefined): string | null {
    const tagline = value?.trim() || null;
    if (tagline && tagline.length > MAX_TAGLINE)
      throw new UnprocessableEntityException(
        `tagline must be at most ${MAX_TAGLINE} characters`,
      );
    return tagline;
  }

  private async requirePerson(tmdbPersonId: number) {
    try {
      return await this.people.getBasics(tmdbPersonId);
    } catch (error) {
      if (error instanceof NotFoundException)
        throw new UnprocessableEntityException(
          'That person is not available from TMDb',
        );
      throw error;
    }
  }

  private async requireFeaturable(tmdbPersonId: number) {
    const found = await this.requirePerson(tmdbPersonId);
    const reasons: string[] = [];
    if (!found.profile.profile_path) reasons.push('has no photo');
    if (!found.profile.biography.trim()) reasons.push('has no biography');
    if (reasons.length)
      throw new UnprocessableEntityException(
        `${found.profile.name} ${reasons.join(' and ')}`,
      );
    return found;
  }

  private async hasPhotoAndBiography(
    tmdbPersonId: number,
    hasPhoto: boolean,
  ): Promise<boolean> {
    // No photo settles it without asking TMDb for the biography.
    if (!hasPhoto) return false;
    try {
      const { profile } = await this.people.getBasics(tmdbPersonId);
      return !!profile.profile_path && !!profile.biography.trim();
    } catch (error) {
      if (!(error instanceof NotFoundException))
        this.logger.warn(
          `Eligibility check for #${tmdbPersonId} failed: ${String(error)}`,
        );
      return false;
    }
  }

  private async candidateItem(
    row: FeaturedCandidate,
  ): Promise<FeaturedCandidateItem> {
    let profile: PersonProfile | null = null;
    try {
      profile = (await this.people.getBasics(row.tmdbPersonId)).profile;
    } catch (error) {
      if (!(error instanceof NotFoundException))
        this.logger.warn(
          `Lookup of #${row.tmdbPersonId} failed: ${String(error)}`,
        );
    }
    return {
      tmdbPersonId: row.tmdbPersonId,
      boost: row.boost,
      blocked: row.blocked,
      note: row.note,
      updatedBy: row.updatedBy,
      updatedAt: row.updatedAt,
      person: profile && {
        id: profile.id,
        name: profile.name,
        profile_path: profile.profile_path,
        knownForDepartment: profile.knownForDepartment,
      },
    };
  }
}
