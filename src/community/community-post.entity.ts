import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CommunityComment } from './community-comment.entity';
import { User } from '../users/user.entity';
import { Movie } from '../movies/movie.entity';
import { Room } from '../rooms/room.entity';
import { RoomInviteLink } from '../room-invite-links/room-invite-link.entity';

@Entity()
@Index('IDX_community_post_author_id', ['authorId', 'id'])
@Index('IDX_community_post_room_id', ['roomId', 'id'])
@Index('UQ_community_post_repost', ['authorId', 'quotedPostId'], {
  unique: true,
  where: `"text" = ''`,
})
@Check('CHK_community_post_rating', '"rating" >= 0 AND "rating" <= 10')
export class CommunityPost {
  @PrimaryGeneratedColumn() id: number;
  @Column() authorId: number;
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'authorId' })
  author: User;
  @Column({ type: 'uuid', nullable: true }) movieId: string | null;
  @ManyToOne(() => Movie, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'movieId' })
  movie: Movie | null;
  @Column({ type: 'varchar', length: 4000 }) text: string;
  @Column({ type: 'float', nullable: true }) rating: number | null;
  @Column({ type: 'varchar', length: 2048, nullable: true }) imageUrl:
    | string
    | null;
  // Set on quotes (text) and plain reposts (empty text).
  @Index('IDX_community_post_quoted_post_id')
  @Column({ type: 'integer', nullable: true })
  quotedPostId: number | null;
  @ManyToOne(() => CommunityPost, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'quotedPostId' })
  quotedPost: CommunityPost | null;
  @Column({ type: 'integer', nullable: true }) roomId: number | null;
  @ManyToOne(() => Room, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'roomId' })
  room: Room | null;
  @Column({ type: 'integer', nullable: true }) promotedInviteId: number | null;
  @ManyToOne(() => RoomInviteLink, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'promotedInviteId' })
  promotedInvite: RoomInviteLink | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
  @OneToMany(() => CommunityComment, (comment) => comment.post)
  comments: CommunityComment[];
}
