import { Room } from '../rooms/room.entity';
import { User } from '../users/user.entity';
import {
  Check,
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  JoinColumn,
} from 'typeorm';

export const INVITATION_STATUSES = [
  'awaiting_approval',
  'pending',
  'accepted',
  'declined',
  'rejected',
  'cancelled',
  'expired',
] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

// An open invitation can still be answered, approved or cancelled.
export const OPEN_INVITATION_STATUSES = [
  'awaiting_approval',
  'pending',
] as const;
const OPEN_SQL = `"status" IN ('awaiting_approval', 'pending')`;

@Entity()
@Index('IDX_invitation_room_created', ['room', 'createdAt', 'id'])
@Index('UQ_room_invitation_open_invitee', ['room', 'inviteeUserId'], {
  unique: true,
  where: OPEN_SQL,
})
@Index('UQ_room_invitation_open_email', ['room', 'email'], {
  unique: true,
  where: `"email" IS NOT NULL AND ${OPEN_SQL}`,
})
@Index(
  'IDX_room_invitation_invitee_created',
  ['inviteeUserId', 'createdAt', 'id'],
  {
    where: '"inviteeUserId" IS NOT NULL',
  },
)
@Index('IDX_room_invitation_inviter_created', ['inviterId', 'createdAt'])
@Index('IDX_room_invitation_open_expiry', ['expiresAt'], { where: OPEN_SQL })
@Check(
  'CHK_room_invitation_status',
  `"status" IN (${INVITATION_STATUSES.map((s) => `'${s}'`).join(', ')})`,
)
export class RoomInvitation {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Room, { onDelete: 'CASCADE' })
  room: Room;

  @Column({ type: 'integer', nullable: true })
  inviterId: number | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'inviterId' })
  inviter: User | null;

  // Set for invitations to an account. Email-only invitations leave it null.
  @Column({ type: 'integer', nullable: true })
  inviteeUserId: number | null;
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'inviteeUserId' })
  invitee: User | null;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: InvitationStatus;

  @Column({
    type: 'enum',
    enum: ['member', 'notVerified', 'guest'],
    default: 'guest',
  })
  userStatus: 'member' | 'notVerified' | 'guest';

  @Column({ type: 'integer', nullable: true })
  reviewedById: number | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reviewedById' })
  reviewedBy: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  respondedAt: Date | null;

  // When the invitee first got to see it; null while awaiting approval, and
  // forever for rejected invitations.
  @Column({ type: 'timestamptz', nullable: true })
  pendingAt: Date | null;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
