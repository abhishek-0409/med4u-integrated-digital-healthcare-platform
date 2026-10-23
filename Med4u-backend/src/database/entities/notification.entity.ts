import { Entity, Column, Index, ManyToOne, JoinColumn, Relation } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';

export enum NotificationType {
  APPOINTMENT_REMINDER = 'appointment_reminder',
  PRESCRIPTION_READY = 'prescription_ready',
  PRESCRIPTION_ISSUED = 'prescription_issued',
  CALL_INCOMING = 'call_incoming',
  GENERAL = 'general',
}

@Entity('notifications')
@Index(['userId'])
@Index(['userId', 'isRead'])
@Index(['userId', 'type'])
export class Notification extends BaseEntity {
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'enum', enum: NotificationType, default: NotificationType.GENERAL })
  type: NotificationType;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'jsonb', nullable: true })
  data?: Record<string, unknown>;

  @Column({ type: 'boolean', name: 'is_read', default: false })
  isRead: boolean;

  @ManyToOne(() => User, (user) => user.notifications, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;
}
