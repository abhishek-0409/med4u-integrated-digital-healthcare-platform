import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  Relation,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';
import { Order } from './order.entity';

/** Append-only audit trail of order status changes. */
@Entity('order_events')
@Index(['orderId', 'createdAt'])
export class OrderEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'uuid', name: 'order_id' })
  orderId: string;

  @Column({ type: 'uuid', name: 'actor_id', nullable: true })
  actorId?: string | null;

  @Column({ type: 'varchar', name: 'actor_role', length: 20 })
  actorRole: string;

  @Column({ type: 'varchar', name: 'from_status', length: 30, nullable: true })
  fromStatus?: string | null;

  @Column({ type: 'varchar', name: 'to_status', length: 30 })
  toStatus: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  note?: string | null;

  @ManyToOne(() => Order, (order) => order.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Relation<Order>;
}
