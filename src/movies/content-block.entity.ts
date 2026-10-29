import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

export type ContentBlockKind = 'movie' | 'person';
// rule: broke a content-filter rule itself. linked: credited with something
// blocked (see scripts/audit-adult-content.cjs). manual: added by hand.
export type ContentBlockSource = 'rule' | 'linked' | 'manual';

// TMDb movies and people never shown or imported, whatever TMDb returns.
@Entity()
@Unique(['kind', 'tmdbId'])
export class ContentBlock {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 16 })
  kind: ContentBlockKind;

  @Column({ type: 'integer' })
  tmdbId: number;

  @Column({ type: 'varchar', length: 16 })
  source: ContentBlockSource;

  // Title or name, so the table reads without asking TMDb.
  @Column({ type: 'varchar', nullable: true })
  label: string | null;

  @Column({ type: 'text' })
  reason: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
