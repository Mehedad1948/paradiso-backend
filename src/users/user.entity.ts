import { Role } from 'src/roles/role.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Exclude, Expose } from 'class-transformer';
@Entity()
export class User {
  @PrimaryGeneratedColumn() // ✅ Good for unique user IDs
  @Expose()
  id: number;

  @Column({ unique: true, type: 'varchar', length: 255 }) // ✅ explicit
  @Expose()
  email: string;

  @Column({ type: 'varchar', length: 255 })
  @Exclude()
  password: string;

  @Column({ type: 'varchar', length: 100 })
  @Expose()
  username: string;

  @Column({ nullable: true, type: 'varchar', length: 255 }) // ✅ optional avatar
  @Expose()
  avatar?: string;

  @Expose()
  @ManyToOne(() => Role, (role) => role.users)
  role: Role;
}
