import {
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
import { CommunityPost } from './community-post.entity';

@Entity()
@Index('IDX_community_comment_post_id', ['postId', 'id'])
export class CommunityComment {
  @PrimaryGeneratedColumn() id: number;
  @Column() postId: number;
  @ManyToOne(() => CommunityPost, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'postId' })
  post: CommunityPost;
  @Column() authorId: number;
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'authorId' })
  author: User;
  @Column({ type: 'varchar', length: 2000 }) text: string;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
