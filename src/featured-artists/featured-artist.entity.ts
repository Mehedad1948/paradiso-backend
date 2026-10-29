import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type FeaturedSource = 'auto' | 'manual';

// One row per UTC day: the artist shown on the homepage that day. The pick is
// stored, never re-derived, so everyone sees the same person all day.
@Entity({ name: 'featured_artist' })
export class FeaturedArtist {
  @PrimaryGeneratedColumn()
  id: number;

  // YYYY-MM-DD (UTC).
  @Column({ name: 'feature_date', type: 'date', unique: true })
  featureDate: string;

  // Not unique: the same person comes back after the cooldown.
  @Index('IDX_featured_artist_tmdb_person_id')
  @Column({ name: 'tmdb_person_id', type: 'integer' })
  tmdbPersonId: number;

  // Name, photo and department as they were at pick time, so listing the
  // history never calls TMDb.
  @Column({ type: 'text' })
  name: string;

  @Column({ name: 'profile_path', type: 'text' })
  profilePath: string;

  @Column({ name: 'known_for_department', type: 'text', nullable: true })
  knownForDepartment: string | null;

  @Column({ type: 'varchar', length: 140, nullable: true })
  tagline: string | null;

  @Column({ type: 'varchar', length: 8 })
  source: FeaturedSource;

  // The site admin behind a manual pick.
  @Column({ name: 'created_by', type: 'integer', nullable: true })
  createdBy: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
