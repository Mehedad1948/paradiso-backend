import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { CurationKey } from './curations.constants';

// One row per hand-curated list. The rows are created by the migration; the
// list itself is in curation_item.
@Entity({ name: 'curation' })
export class Curation {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  key: CurationKey;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;

  @Column({ name: 'updated_by', type: 'integer', nullable: true })
  updatedById: number | null;

  // The admin who saved last; null for the seed or after the account is gone.
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updated_by' })
  updatedBy: User | null;
}
