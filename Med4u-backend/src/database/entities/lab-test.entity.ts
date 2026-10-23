import { Entity, Column, Index, OneToMany, Relation } from 'typeorm';
import { BaseEntity } from './base.entity';
import { LabBooking } from './lab-booking.entity';

@Entity('lab_tests')
@Index(['category'])
export class LabTest extends BaseEntity {
  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 100 })
  category: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ type: 'int', name: 'turnaround_days' })
  turnaroundDays: number;

  @Column({ type: 'varchar', name: 'sample_type', length: 80, default: 'Not specified' })
  sampleType: string;

  @Column({ type: 'text', name: 'preparation_instructions', default: 'No instructions provided.' })
  preparationInstructions: string;

  @Column({ type: 'boolean', name: 'home_collection_available', default: false })
  homeCollectionAvailable: boolean;

  @Column({ type: 'varchar', name: 'lab_location', length: 160, default: 'Demo service only' })
  labLocation: string;

  @Column({ type: 'boolean', name: 'is_demo', default: false })
  isDemo: boolean;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => LabBooking, (booking) => booking.test)
  bookings?: Relation<LabBooking[]>;
}
