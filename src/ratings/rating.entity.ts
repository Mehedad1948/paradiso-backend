import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Unique,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Movie } from '../movies/movie.entity';
import { Room } from '../rooms/room.entity';

@Entity()
@Unique(['user', 'movie', 'room'])
@Index('IDX_rating_room_movie', ['room', 'movie'])
export class Rating {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  rate: number;

  @ManyToOne(() => User, (user) => user.ratings, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Movie, (movie) => movie.ratings, { onDelete: 'CASCADE' })
  movie: Movie;

  @ManyToOne(() => Room, (room) => room.ratings, { onDelete: 'CASCADE' })
  room: Room;
}
