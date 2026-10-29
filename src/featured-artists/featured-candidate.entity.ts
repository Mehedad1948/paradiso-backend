import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

// Editorial control over automatic picks. A person without a row has boost 1
// and is not blocked.
@Entity({ name: 'featured_candidate' })
export class FeaturedCandidate {
  @PrimaryColumn({ name: 'tmdb_person_id', type: 'integer' })
  tmdbPersonId: number;

  // Multiplies the person's weight: 0 never, 1 normal, 10 ten times as often.
  @Column({
    type: 'numeric',
    precision: 4,
    scale: 2,
    default: 1,
    transformer: { to: (value: number) => value, from: Number },
  })
  boost: number;

  // Never auto-picked. An editor can still schedule them by hand.
  @Column({ type: 'boolean', default: false })
  blocked: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @Column({ name: 'updated_by', type: 'integer' })
  updatedBy: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
