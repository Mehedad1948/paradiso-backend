import { Rating } from 'src/ratings/rating.entity';
import { User } from 'src/users/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';

@Entity()
export class Movie {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

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
}
