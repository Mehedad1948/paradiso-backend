import { Rating } from '../ratings/rating.entity';
import { User } from '../users/user.entity';
import { Genre } from '../genres/genre.entity'; // You'll need to create this
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinTable,
  Unique,
  Index,
} from 'typeorm';
import { Room } from '../rooms/room.entity';

export interface MovieCastMember {
  name: string;
  character: string | null;
  profile_path: string | null;
}

@Entity()
@Unique(['dbId'])
@Index('IDX_movie_created_id', ['createdAt', 'id'])
export class Movie {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // TMDb ID; null for movies a user entered manually.
  @Column({ type: 'integer', nullable: true })
  dbId: number | null;

  @Column({ nullable: false })
  title: string;

  @Column({ nullable: true })
  poster_path: string;

  @Column({ type: 'float', nullable: true })
  vote_average: number;

  @Column({ nullable: true })
  overview: string;

  @Column({ nullable: true })
  original_title: string;

  @Column({ nullable: true })
  video: string;

  @Column({ nullable: true })
  release_date: string;

  @Column({ type: 'float', nullable: true })
  imdbRate: number;

  @Column({ nullable: true })
  imdbLink: string;

  @Column({ default: false })
  isWatchedTogether: boolean;

  // Minutes. Small enough to ride along with every list that loads a movie.
  @Column({ type: 'integer', nullable: true })
  runtime: number | null;

  // The columns below only feed the details screen, so default selects (and
  // with them every list that loads whole movies) leave them out.
  @Column({ type: 'varchar', nullable: true, select: false })
  tagline: string | null;

  @Column({ type: 'varchar', nullable: true, select: false })
  backdrop_path: string | null;

  @Column({ type: 'varchar', nullable: true, select: false })
  director: string | null;

  @Column({ type: 'jsonb', nullable: true, select: false })
  cast: MovieCastMember[] | null;

  // YouTube video key.
  @Column({ type: 'varchar', length: 32, nullable: true, select: false })
  trailerKey: string | null;

  // Set once TMDb details were stored; null rows are filled on first view.
  @Column({ type: 'timestamptz', nullable: true, select: false })
  detailsFetchedAt: Date | null;

  @ManyToOne(() => User, { eager: true })
  addedBy: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Rating, (rating) => rating.movie)
  ratings: Rating[];

  @ManyToMany(() => Genre, { eager: true, cascade: true })
  @JoinTable()
  genres: Genre[];

  @ManyToMany(() => Room, (room) => room.movies)
  rooms: Room[];
}
