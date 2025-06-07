import { Room } from 'src/rooms/room.entity';
import { User } from 'src/users/user.entity';
import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

@Entity()
@Unique(['email', 'room'])
export class RoomInvitation {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Room, { onDelete: 'CASCADE' })
  room: Room;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  invitedBy: User;

  @Column()
  email: string;

  @Column({
    type: 'enum',
    enum: ['pending', 'accepted', 'declined', 'expired'],
    default: 'pending',
  })
  status: 'pending' | 'accepted' | 'declined' | 'expired';

  @Column({
    type: 'enum',
    enum: ['member', 'notVerified', 'guest'],
    default: 'guest',
  })
  userStatus: 'member' | 'notVerified' | 'guest';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
