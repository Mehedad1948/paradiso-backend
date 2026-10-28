import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Movie } from '../movies/movie.entity';

@Entity()
@Index('IDX_movie_comment_movie_id', ['movieId', 'id'])
@Index('IDX_movie_comment_author_created', ['authorId', 'createdAt'])
@Index('IDX_movie_comment_parent_id', ['parentId', 'id'])
export class MovieComment {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'uuid' }) movieId: string;
  @ManyToOne(() => Movie, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'movieId' })
  movie: Movie;
  @Column() authorId: number;
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'authorId' })
  author: User;
  // Top-level comment this replies to. Threads are one level deep, so a
  // reply to a reply is stored under the same top-level comment.
  @Column({ type: 'integer', nullable: true }) parentId: number | null;
  @ManyToOne(() => MovieComment, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'parentId' })
  parent: MovieComment | null;
  @Column({ type: 'varchar', length: 2000 }) text: string;
  // Clients hide the text behind a tap until the reader opts in.
  @Column({ default: false }) spoiler: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
