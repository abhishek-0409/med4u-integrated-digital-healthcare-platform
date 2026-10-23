import { Column, Entity, Index, JoinColumn, ManyToOne, Relation, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { PushDeliveryTicket } from './push-delivery-ticket.entity';

@Entity('device_push_tokens')
@Index(['userId', 'deviceId'], { unique: true })
@Index(['token'], { unique: true })
export class DevicePushToken extends BaseEntity {
  @Column({ type: 'uuid', name: 'user_id' }) userId: string;
  @Column({ type: 'varchar', length: 255 }) token: string;
  @Column({ type: 'varchar', name: 'device_id', length: 100 }) deviceId: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user: Relation<User>;
  @OneToMany(() => PushDeliveryTicket, (ticket) => ticket.devicePushToken) tickets: Relation<PushDeliveryTicket[]>;
}
