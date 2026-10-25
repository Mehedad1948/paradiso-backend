import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Movie } from '../movies/movie.entity';
import { User } from '../users/user.entity';

// A movie pinned to a user's public profile. Lists are short and hand-ordered.
@Entity()
@Index('IDX_favorite_movie_user_position', ['userId', 'position'])
export class FavoriteMovie {
  @PrimaryColumn() userId: number;
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'userId' })
  user: User;

  @PrimaryColumn({ type: 'uuid' }) movieId: string;
  @ManyToOne(() => Movie, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'movieId' })
  movie: Movie;

  @Column({ type: 'integer' }) position: number;

  @CreateDateColumn() createdAt: Date;
}
