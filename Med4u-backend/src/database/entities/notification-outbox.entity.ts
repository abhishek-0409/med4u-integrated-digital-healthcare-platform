import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

/** Durable in-app notification work, committed atomically with its source event. */
@Entity('notification_outbox')
@Index('UQ_notification_outbox_event_key', ['eventKey'], { unique: true })
@Index('IDX_notification_outbox_pending', ['deliveredAt', 'createdAt'])
export class NotificationOutbox extends BaseEntity {
  @Column({ type: 'varchar', length: 160, name: 'event_key' })
  eventKey: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 80 })
  type: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'jsonb', nullable: true })
  data: Record<string, unknown> | null;

  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({ type: 'timestamptz', nullable: true, name: 'delivered_at' })
  deliveredAt: Date | null;
}
