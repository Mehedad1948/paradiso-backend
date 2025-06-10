import { Rating } from 'src/ratings/rating.entity';
import { User } from 'src/users/user.entity';
import { Genre } from 'src/genres/genre.entity'; // You'll need to create this
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
} from 'typeorm';
import { Room } from 'src/rooms/room.entity';

@Entity()
@Unique(['dbId'])
export class Movie {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false })
  dbId: number;

  @Column({ nullable: false })
  title: string;

  @Column({ nullable: true })
  poster_path: string;

  @Column({ type: 'float', nullable: true })
  vote_average: number;

  @Column({ nullable: true })
  overview: string;

  @Column({ type: 'date', nullable: true })
  releaseDate: Date;

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
