import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Room } from '../rooms/room.entity';
import { CommunityPost } from '../community/community-post.entity';

export const NOTIFICATION_TYPES = [
  'room_invite',
  'movie_added',
  'chat_mention',
  'post_liked',
  'post_commented',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_ENTITY_TYPES = [
  'room',
  'post',
  'movie',
  'message',
] as const;
export type NotificationEntityType = (typeof NOTIFICATION_ENTITY_TYPES)[number];

// Render snapshot, so a notification still shows if its entity changes later.
export interface NotificationData {
  roomName?: string;
  roomImage?: string | null;
  inviteToken?: string;
  movieTitle?: string;
  posterUrl?: string | null;
  postExcerpt?: string;
  commentExcerpt?: string;
  messageExcerpt?: string;
  reason?: 'mention' | 'reply';
}

const list = (values: readonly string[]) =>
  values.map((value) => `'${value}'`).join(', ');

// In-app notifications for the bell. Grouped types (post likes and comments)
// keep one unread row per post, which the partial unique index enforces.
// roomId and postId cascade, so deleting a room or post removes its
// notifications; entityType and entityId only tell the client what to open.
@Entity()
@Index('IDX_notification_recipient_updated', ['recipientId', 'updatedAt', 'id'])
@Index(
  'IDX_notification_recipient_unread',
  ['recipientId', 'updatedAt', 'id'],
  {
    where: '"readAt" IS NULL',
  },
)
@Index('UQ_notification_recipient_group', ['recipientId', 'groupKey'], {
  unique: true,
  where: '"readAt" IS NULL AND "groupKey" IS NOT NULL',
})
@Index('IDX_notification_read_at', ['readAt'], {
  where: '"readAt" IS NOT NULL',
})
@Check('CHK_notification_type', `"type" IN (${list(NOTIFICATION_TYPES)})`)
@Check(
  'CHK_notification_entity_type',
  `"entityType" IN (${list(NOTIFICATION_ENTITY_TYPES)})`,
)
export class Notification {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column() recipientId: number;
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'recipientId' })
  recipient: User;

  @Column({ type: 'varchar', length: 32 }) type: NotificationType;

  // The latest actor; actorCount drives "X and N others".
  @Column() actorId: number;
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'actorId' })
  actor: User;
  @Column({ type: 'integer', default: 1 }) actorCount: number;

  @Column({ type: 'varchar', length: 16 }) entityType: NotificationEntityType;
  @Column({ type: 'varchar', length: 64 }) entityId: string;

  @Index('IDX_notification_room_id', { where: '"roomId" IS NOT NULL' })
  @Column({ type: 'integer', nullable: true })
  roomId: number | null;
  @ManyToOne(() => Room, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'roomId' })
  room: Room | null;

  @Index('IDX_notification_post_id', { where: '"postId" IS NOT NULL' })
  @Column({ type: 'integer', nullable: true })
  postId: number | null;
  @ManyToOne(() => CommunityPost, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'postId' })
  post: CommunityPost | null;

  @Column({ type: 'jsonb', default: {} }) data: NotificationData;

  @Column({ type: 'varchar', length: 128, nullable: true })
  groupKey: string | null;

  @Column({ type: 'timestamptz', nullable: true }) readAt: Date | null;

  // Millisecond precision so the updatedAt cursor round-trips through JS dates.
  @CreateDateColumn({ type: 'timestamptz', precision: 3 }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz', precision: 3 }) updatedAt: Date;
}
