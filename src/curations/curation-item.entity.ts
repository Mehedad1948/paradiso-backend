import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Movie } from '../movies/movie.entity';
import { Curation } from './curation.entity';
import {
  CurationKey,
  EDITORS_PICKS,
  MAX_IMAGE_URL,
  MAX_OBJECT_POSITION,
} from './curations.constants';

// A movie in a curated list. landing-grid: slot is the grid cell and a movie
// may fill several. editors-picks: slot is the display order and a movie
// appears once, which the partial unique index enforces.
@Entity({ name: 'curation_item' })
@Unique('UQ_curation_item_key_slot', ['curationKey', 'slot'])
@Index('UQ_curation_item_editors_pick_movie', ['curationKey', 'movieId'], {
  unique: true,
  where: `"curation_key" = '${EDITORS_PICKS}'`,
})
@Index('IDX_curation_item_movie_id', ['movieId'])
export class CurationItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'curation_key', type: 'varchar', length: 32 })
  curationKey: CurationKey;

  @ManyToOne(() => Curation, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'curation_key' })
  curation: Curation;

  @Column({ name: 'movie_id', type: 'uuid' })
  movieId: string;

  // Removing a movie from the library removes it from every list.
  @ManyToOne(() => Movie, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'movie_id' })
  movie: Movie;

  @Column({ type: 'integer' })
  slot: number;

  // landing-grid only: the hand-graded image shown instead of the poster.
  @Column({
    name: 'image_url',
    type: 'varchar',
    length: MAX_IMAGE_URL,
    nullable: true,
  })
  imageUrl: string | null;

  // landing-grid only: CSS object-position for that image.
  @Column({
    name: 'object_position',
    type: 'varchar',
    length: MAX_OBJECT_POSITION,
    nullable: true,
  })
  objectPosition: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
