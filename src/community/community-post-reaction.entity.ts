import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { CommunityPost } from './community-post.entity';

// One like (1) or dislike (-1) per user per post.
@Entity()
@Index('IDX_community_post_reaction_post_value', ['postId', 'value'])
@Check('CHK_community_post_reaction_value', '"value" IN (1, -1)')
export class CommunityPostReaction {
  @PrimaryColumn() postId: number;
  @ManyToOne(() => CommunityPost, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'postId' })
  post: CommunityPost;
  @PrimaryColumn() userId: number;
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'userId' })
  user: User;
  @Column({ type: 'smallint' }) value: number;
  @CreateDateColumn() createdAt: Date;
}
