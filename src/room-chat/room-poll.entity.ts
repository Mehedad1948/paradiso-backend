import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Movie } from '../movies/movie.entity';
import { RoomMessage } from './room-message.entity';

// A poll belongs to one message; the message text is the question.
@Entity()
export class RoomPoll {
  @PrimaryColumn() messageId: number;
  @ManyToOne(() => RoomMessage, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'messageId' })
  message: RoomMessage;
  @Column({ default: false }) allowsMultiple: boolean;
  @Column({ default: false }) anonymous: boolean;
  @Column({ type: 'timestamptz', nullable: true }) closesAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) closedAt: Date | null;
}

@Entity()
@Index('IDX_room_poll_option_message', ['messageId', 'position'])
export class RoomPollOption {
  @PrimaryGeneratedColumn() id: number;
  @Column() messageId: number;
  @ManyToOne(() => RoomPoll, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'messageId' })
  poll: RoomPoll;
  @Column({ type: 'smallint' }) position: number;
  @Column({ type: 'varchar', length: 200 }) text: string;
  @Column({ type: 'uuid', nullable: true }) movieId: string | null;
  @ManyToOne(() => Movie, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'movieId' })
  movie: Movie | null;
}

@Entity()
@Index('IDX_room_poll_vote_message_user', ['messageId', 'userId'])
export class RoomPollVote {
  @PrimaryColumn() optionId: number;
  @ManyToOne(() => RoomPollOption, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'optionId' })
  option: RoomPollOption;
  @PrimaryColumn() userId: number;
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'userId' })
  user: User;
  @Column() messageId: number;
  @ManyToOne(() => RoomPoll, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'messageId' })
  poll: RoomPoll;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
