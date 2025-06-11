import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Unique,
} from 'typeorm';
import { User } from 'src/users/user.entity';
import { Movie } from 'src/movies/movie.entity';
import { Room } from 'src/rooms/room.entity';

@Entity()
@Unique(['user', 'movie', 'room'])
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
