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
@Check('CHK_community_post_rating', '"rating" >= 0 AND "rating" <= 10')
export class CommunityPost {
  @PrimaryGeneratedColumn() id: number;
  @Column() authorId: number;
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'authorId' })
  author: User;
  @Column({ type: 'uuid' }) movieId: string;
  @ManyToOne(() => Movie, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'movieId' })
  movie: Movie;
  @Column({ type: 'varchar', length: 4000 }) text: string;
  @Column({ type: 'float' }) rating: number;
  @Column({ type: 'varchar', length: 2048, nullable: true }) imageUrl:
    | string
    | null;
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
