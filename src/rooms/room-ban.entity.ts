import { User } from '../users/user.entity';
import { Room } from './room.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity()
@Unique(['room', 'user'])
export class RoomBan {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Room, { onDelete: 'CASCADE', nullable: false })
  room: Room;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  user: User;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  bannedBy: User | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
