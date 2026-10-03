import {
  Check,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity()
@Index('IDX_user_follow_following_follower', ['followingId', 'followerId'])
@Check('CHK_user_follow_not_self', '"followerId" <> "followingId"')
export class UserFollow {
  @PrimaryColumn() followerId: number;
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'followerId' })
  follower: User;
  @PrimaryColumn() followingId: number;
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'followingId' })
  following: User;
  @CreateDateColumn() createdAt: Date;
}
