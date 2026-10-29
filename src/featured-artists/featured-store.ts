import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeaturedArtist } from './featured-artist.entity';
import { FeaturedCandidate } from './featured-candidate.entity';

export type NewFeaturedArtist = Pick<
  FeaturedArtist,
  | 'featureDate'
  | 'tmdbPersonId'
  | 'name'
  | 'profilePath'
  | 'knownForDepartment'
  | 'tagline'
  | 'source'
  | 'createdBy'
>;

export interface CandidateFilter {
  boosted?: boolean;
  blocked?: boolean;
  page: number;
  limit: number;
}

// Every query the feature makes. The services hold the rules; keeping the SQL
// here lets their tests run against an in-memory copy.
@Injectable()
export class FeaturedStore {
  constructor(
    @InjectRepository(FeaturedArtist)
    private readonly artists: Repository<FeaturedArtist>,
    @InjectRepository(FeaturedCandidate)
    private readonly candidates: Repository<FeaturedCandidate>,
  ) {}

  findByDate(date: string): Promise<FeaturedArtist | null> {
    return this.artists.findOne({ where: { featureDate: date } });
  }

  // Newest first, never later than `date`.
  listUpTo(date: string, limit: number): Promise<FeaturedArtist[]> {
    return this.artists
      .createQueryBuilder('artist')
      .where('artist.featureDate <= :date', { date })
      .orderBy('artist.featureDate', 'DESC')
      .limit(limit)
      .getMany();
  }

  range(from: string, to: string): Promise<FeaturedArtist[]> {
    return this.artists
      .createQueryBuilder('artist')
      .where('artist.featureDate BETWEEN :from AND :to', { from, to })
      .orderBy('artist.featureDate', 'ASC')
      .getMany();
  }

  // False when the day already has a row, whoever won the race.
  async insertIfAbsent(row: NewFeaturedArtist): Promise<boolean> {
    const result = await this.artists
      .createQueryBuilder()
      .insert()
      .values(row)
      .orIgnore()
      .execute();
    // RETURNING is empty when the conflict skipped the insert.
    return (result.raw as unknown[]).length > 0;
  }

  // Sets the day's pick, replacing whatever is there.
  async replace(row: NewFeaturedArtist): Promise<void> {
    await this.artists
      .createQueryBuilder()
      .insert()
      .values(row)
      .orUpdate(
        [
          'tmdb_person_id',
          'name',
          'profile_path',
          'known_for_department',
          'tagline',
          'source',
          'created_by',
          'updated_at',
        ],
        ['feature_date'],
      )
      .execute();
  }

  async deleteByDate(date: string): Promise<boolean> {
    const result = await this.artists.delete({ featureDate: date });
    return (result.affected ?? 0) > 0;
  }

  // People featured from `from` to `to`, with the day.
  async appearances(
    from: string,
    to: string,
  ): Promise<{ tmdbPersonId: number; featureDate: string }[]> {
    const rows = await this.artists
      .createQueryBuilder('artist')
      .select('artist.tmdbPersonId', 'tmdbPersonId')
      .addSelect("to_char(artist.featureDate, 'YYYY-MM-DD')", 'featureDate')
      .where('artist.featureDate BETWEEN :from AND :to', { from, to })
      .getRawMany<{ tmdbPersonId: number; featureDate: string }>();
    return rows.map((row) => ({
      tmdbPersonId: Number(row.tmdbPersonId),
      featureDate: row.featureDate,
    }));
  }

  // The latest day each of these people was featured, up to `date`.
  async lastFeatured(
    tmdbPersonIds: number[],
    date: string,
  ): Promise<Map<number, string>> {
    if (!tmdbPersonIds.length) return new Map();
    const rows = await this.artists
      .createQueryBuilder('artist')
      .select('artist.tmdbPersonId', 'tmdbPersonId')
      .addSelect("to_char(MAX(artist.featureDate), 'YYYY-MM-DD')", 'last')
      .where('artist.tmdbPersonId = ANY(:ids)', { ids: tmdbPersonIds })
      .andWhere('artist.featureDate <= :date', { date })
      .groupBy('artist.tmdbPersonId')
      .getRawMany<{ tmdbPersonId: number; last: string }>();
    return new Map(rows.map((row) => [Number(row.tmdbPersonId), row.last]));
  }

  // People credited on the most library films, from the credits stored with
  // each movie. Rows stored before credit IDs existed contribute nothing.
  async libraryPeople(
    limit: number,
  ): Promise<{ tmdbPersonId: number; films: number }[]> {
    const rows = await this.artists.query<{ id: string; films: string }[]>(
      `SELECT credit.id, COUNT(DISTINCT movie.id) AS films
       FROM movie
       CROSS JOIN LATERAL (
         SELECT person->>'id' AS id
         FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(movie."directors") = 'array' THEN movie."directors" ELSE '[]'::jsonb END ||
           CASE WHEN jsonb_typeof(movie."cast") = 'array' THEN movie."cast" ELSE '[]'::jsonb END ||
           CASE WHEN jsonb_typeof(movie."crew") = 'array' THEN movie."crew" ELSE '[]'::jsonb END
         ) AS person
       ) AS credit
       WHERE credit.id ~ '^[0-9]+$'
       GROUP BY credit.id
       ORDER BY films DESC, credit.id
       LIMIT $1`,
      [limit],
    );
    return rows.map((row) => ({
      tmdbPersonId: Number(row.id),
      films: Number(row.films),
    }));
  }

  allCandidates(): Promise<FeaturedCandidate[]> {
    return this.candidates.find();
  }

  findCandidate(tmdbPersonId: number): Promise<FeaturedCandidate | null> {
    return this.candidates.findOne({ where: { tmdbPersonId } });
  }

  findCandidates(tmdbPersonIds: number[]): Promise<FeaturedCandidate[]> {
    if (!tmdbPersonIds.length) return Promise.resolve([]);
    return this.candidates
      .createQueryBuilder('candidate')
      .where('candidate.tmdbPersonId = ANY(:ids)', { ids: tmdbPersonIds })
      .getMany();
  }

  async pageCandidates(
    filter: CandidateFilter,
  ): Promise<{ rows: FeaturedCandidate[]; total: number }> {
    const query = this.candidates.createQueryBuilder('candidate');
    if (filter.boosted !== undefined)
      query.andWhere(
        filter.boosted ? 'candidate.boost > 1' : 'candidate.boost <= 1',
      );
    if (filter.blocked !== undefined)
      query.andWhere('candidate.blocked = :blocked', {
        blocked: filter.blocked,
      });
    const [rows, total] = await query
      .orderBy('candidate.updatedAt', 'DESC')
      .addOrderBy('candidate.tmdbPersonId', 'ASC')
      .take(filter.limit)
      .skip((filter.page - 1) * filter.limit)
      .getManyAndCount();
    return { rows, total };
  }

  saveCandidate(candidate: FeaturedCandidate): Promise<FeaturedCandidate> {
    return this.candidates.save(candidate);
  }

  async deleteCandidate(tmdbPersonId: number): Promise<boolean> {
    const result = await this.candidates.delete({ tmdbPersonId });
    return (result.affected ?? 0) > 0;
  }
}
