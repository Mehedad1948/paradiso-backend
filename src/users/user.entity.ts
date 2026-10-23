import { Exclude, Expose } from 'class-transformer';
import { Rating } from '../ratings/rating.entity';
import { Role } from '../roles/role.entity';
import { Genre } from '../genres/genre.entity';
import { Room } from '../rooms/room.entity';
import {
  Column,
  Entity,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Index,
  JoinTable,
} from 'typeorm';
@Entity()
@Index('IDX_user_email_lower', { synchronize: false })
export class User {
  @PrimaryGeneratedColumn()
  @Expose()
  id: number;

  @Column({ unique: true, type: 'varchar', length: 255 })
  @Expose()
  email: string;

  @Column({ type: 'varchar', length: 255 })
  @Exclude()
  password: string;

  @Column({ type: 'varchar', length: 100 })
  @Expose()
  username: string;

  @Column({ nullable: true, type: 'varchar', length: 255 })
  @Expose()
  avatar?: string | null;

  @Column({ nullable: true, type: 'varchar', length: 255 })
  @Exclude()
  verificationCode: string | null;

  @Column({ nullable: true, type: 'timestamp with time zone' })
  @Exclude()
  verificationCodeExpiresAt: Date | null;

  @Column({ default: false })
  isEmailVerified: boolean;

  @Expose()
  @ManyToOne(() => Role, (role) => role.users)
  role: Role;

  @OneToMany(() => Rating, (rating) => rating.user)
  ratings: Rating[];

  @ManyToMany(() => Room, (room) => room.users)
  rooms: Room[];

  // Set once when the optional post-signup onboarding step is finished or skipped.
  @Column({ nullable: true, type: 'timestamp with time zone' })
  @Expose()
  onboardedAt: Date | null;

  @ManyToMany(() => Genre, { onDelete: 'CASCADE' })
  @JoinTable({
    name: 'user_genres',
    joinColumn: { name: 'userId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'genreId', referencedColumnName: 'id' },
  })
  genres: Genre[];
}
