import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Room } from '../rooms/room.entity';
import { User } from '../users/user.entity';
import { Movie } from '../movies/movie.entity';

// Deleted messages stay as tombstones so replies keep their context.
// updatedAt changes on every visible change; clients sync on it.
@Entity()
@Index('IDX_room_message_room_id', ['roomId', 'id'])
@Index('IDX_room_message_room_updated', ['roomId', 'updatedAt'])
@Index('IDX_room_message_author_created', ['authorId', 'createdAt'])
@Index('IDX_room_message_reply_to', ['replyToId'])
export class RoomMessage {
  @PrimaryGeneratedColumn() id: number;
  @Column() roomId: number;
  @ManyToOne(() => Room, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'roomId' })
  room: Room;
  @Column() authorId: number;
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'authorId' })
  author: User;
  @Column({ type: 'varchar', length: 2000, nullable: true }) text:
    | string
    | null;
  @Column({ type: 'integer', nullable: true }) replyToId: number | null;
  @ManyToOne(() => RoomMessage, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'replyToId' })
  replyTo: RoomMessage | null;
  @Column({ type: 'timestamptz', nullable: true }) pinnedAt: Date | null;
  @Column({ type: 'integer', nullable: true }) pinnedById: number | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'pinnedById' })
  pinnedBy: User | null;
  @Column({ type: 'timestamptz', nullable: true }) editedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) deletedAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity()
@Index('IDX_room_message_mention_user', ['userId', 'messageId'])
export class RoomMessageMention {
  @PrimaryColumn() messageId: number;
  @ManyToOne(() => RoomMessage, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'messageId' })
  message: RoomMessage;
  @PrimaryColumn() userId: number;
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'userId' })
  user: User;
}

// A movie card in a message. Display fields are a snapshot so the card still
// renders for TMDb movies that were never imported. movieId links a room movie.
@Entity()
@Index('IDX_room_message_movie_message', ['messageId', 'position'])
export class RoomMessageMovie {
  @PrimaryGeneratedColumn() id: number;
  @Column() messageId: number;
  @ManyToOne(() => RoomMessage, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'messageId' })
  message: RoomMessage;
  @Column({ type: 'smallint' }) position: number;
  @Column({ type: 'uuid', nullable: true }) movieId: string | null;
  @ManyToOne(() => Movie, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'movieId' })
  movie: Movie | null;
  @Column({ type: 'integer', nullable: true }) tmdbId: number | null;
  @Column({ type: 'varchar', length: 255 }) title: string;
  @Column({ type: 'varchar', length: 4, nullable: true }) year: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) posterPath:
    | string
    | null;
}

@Entity()
export class RoomMessageReaction {
  @PrimaryColumn() messageId: number;
  @ManyToOne(() => RoomMessage, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'messageId' })
  message: RoomMessage;
  @PrimaryColumn() userId: number;
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'userId' })
  user: User;
  @PrimaryColumn({ type: 'varchar', length: 32 }) emoji: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity()
export class RoomChatRead {
  @PrimaryColumn() roomId: number;
  @ManyToOne(() => Room, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'roomId' })
  room: Room;
  @PrimaryColumn() userId: number;
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'userId' })
  user: User;
  @Column({ type: 'integer', default: 0 }) lastReadMessageId: number;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
