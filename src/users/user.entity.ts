import { Role } from 'src/roles/role.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn() // ✅ Good for unique user IDs
  id: number;

  @Column({ unique: true, type: 'varchar', length: 255 }) // ✅ explicit
  email: string;

  @Column({ type: 'varchar', length: 255 })
  password: string;

  @Column({ type: 'varchar', length: 100 })
  username: string;

  @Column({ nullable: true, type: 'varchar', length: 255 }) // ✅ optional avatar
  avatar?: string;

  @ManyToOne(() => Role, (role) => role.users)
  role: Role;
}
