import { Entity, Column, Index, ManyToOne, JoinColumn, Relation } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { LabTest } from './lab-test.entity';

export enum LabBookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  SAMPLE_COLLECTED = 'sample_collected',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export interface CollectionAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  latitude?: number;
  longitude?: number;
}

@Entity('lab_bookings')
@Index(['userId'])
@Index(['testId'])
@Index(['status'])
@Index(['userId', 'status'])
export class LabBooking extends BaseEntity {
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'uuid', name: 'test_id' })
  testId: string;

  @Column({ type: 'date', name: 'preferred_date' })
  preferredDate: Date;

  @Column({ type: 'varchar', name: 'preferred_time', length: 5, default: '09:00' })
  preferredTime: string;

  @Column({ type: 'decimal', name: 'price_snapshot', precision: 10, scale: 2, default: 0 })
  priceSnapshot: number;

  @Column({ type: 'varchar', name: 'contact_name', length: 100, nullable: true })
  contactName?: string;

  @Column({ type: 'varchar', name: 'contact_phone', length: 20, nullable: true })
  contactPhone?: string;

  @Column({ type: 'varchar', name: 'booking_source', length: 16, default: 'legacy' })
  bookingSource: string;

  @Column({ type: 'jsonb', nullable: true })
  address?: CollectionAddress;

  @Column({ type: 'boolean', name: 'home_collection', default: false })
  homeCollection: boolean;

  @Column({ type: 'enum', enum: LabBookingStatus, default: LabBookingStatus.PENDING })
  status: LabBookingStatus;

  @ManyToOne(() => User, (user) => user.labBookings, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;

  @ManyToOne(() => LabTest, (test) => test.bookings, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'test_id' })
  test: Relation<LabTest>;
}
