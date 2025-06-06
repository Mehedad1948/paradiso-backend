import { Role } from 'src/roles/role.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Exclude, Expose } from 'class-transformer';
import { Rating } from 'src/ratings/rating.entity';
import { Room } from 'src/rooms/room.entity';
@Entity()
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
  avatar?: string;

  @Column({ nullable: true, type: 'varchar', length: 255 })
  verificationCode: string | null;

  @Column({ nullable: true, type: 'timestamp with time zone' })
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
}
