import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Relation,
} from 'typeorm';
import { User } from './user.entity';

@Entity('sessions')
@Index(['userId'])
@Index(['userId', 'isRevoked'])
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', name: 'refresh_token', length: 512 })
  refreshToken: string;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  @Column({ type: 'varchar', name: 'ip_address', length: 45, nullable: true })
  ipAddress?: string;

  @Column({ type: 'text', name: 'user_agent', nullable: true })
  userAgent?: string;

  @Column({ type: 'boolean', name: 'is_revoked', default: false })
  isRevoked: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.sessions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;
}
