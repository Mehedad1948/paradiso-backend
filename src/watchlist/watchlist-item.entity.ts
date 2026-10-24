import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Movie } from '../movies/movie.entity';
import { User } from '../users/user.entity';

@Entity()
@Index('IDX_watchlist_item_user_created', ['userId', 'createdAt'])
export class WatchlistItem {
  @PrimaryColumn() userId: number;
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'userId' })
  user: User;

  @PrimaryColumn({ type: 'uuid' }) movieId: string;
  @ManyToOne(() => Movie, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'movieId' })
  movie: Movie;

  @CreateDateColumn() createdAt: Date;
}
