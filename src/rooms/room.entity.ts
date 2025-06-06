import { Movie } from 'src/movies/movie.entity';
import { Rating } from 'src/ratings/rating.entity';
import { User } from 'src/users/user.entity';
import {
  Column,
  Entity,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
export class Room {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @ManyToMany(() => User, (user) => user.rooms)
  users: User[];

  @ManyToMany(() => Movie, (movie) => movie.rooms)
  movies: Movie[];

  @OneToMany(() => Rating, (rating) => rating.room)
  ratings: Rating[];

  @ManyToOne(() => User, { eager: true })
  owner: User;
}
