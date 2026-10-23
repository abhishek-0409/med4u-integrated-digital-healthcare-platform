import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { BaseEntity } from './base.entity';
import { DevicePushToken } from './device-push-token.entity';

@Entity('push_delivery_tickets')
@Index(['ticketId'], { unique: true })
@Index(['createdAt'])
export class PushDeliveryTicket extends BaseEntity {
  @Column({ type: 'uuid', name: 'device_push_token_id' }) devicePushTokenId: string;
  @Column({ type: 'varchar', name: 'ticket_id', length: 100 }) ticketId: string;
  @ManyToOne(() => DevicePushToken, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'device_push_token_id' })
  devicePushToken: Relation<DevicePushToken>;
}
