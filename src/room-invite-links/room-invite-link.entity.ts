import { Room } from '../rooms/room.entity';
import { User } from '../users/user.entity';
import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity()
@Index('IDX_invite_link_room_created', ['room', 'createdAt', 'id'])
export class RoomInviteLink {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Room, { onDelete: 'CASCADE' })
  room: Room;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  createdBy: User;

  @Column({ unique: true })
  token: string;

  @Column({ nullable: true })
  expiresAt?: Date;

  @Column({ default: 0 })
  maxUsage: number;

  @Column({ default: 0 })
  uses: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ default: true })
  isActive: boolean;
}
