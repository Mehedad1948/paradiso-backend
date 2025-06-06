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
} from 'typeorm';

@Entity()
export class Movie {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false })
  title: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'date', nullable: true })
  releaseDate: Date;

  @Column({ type: 'float', nullable: true })
  imdbRate: number;

  @Column({ nullable: true })
  imdbLink: string;

  @Column({ nullable: true })
  image: string;

  @Column({ default: false })
  isWatchedTogether: boolean;

  @Column({ default: false })
  isIn: boolean;

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
}
