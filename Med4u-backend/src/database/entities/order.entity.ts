import { Entity, Column, Index, ManyToOne, OneToMany, JoinColumn, Relation } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { PrescriptionUpload } from './prescription-upload.entity';
import { OrderItem } from './order-item.entity';
import { OrderEvent } from './order-event.entity';
import { ClinicalPrescription } from './clinical-prescription.entity';

export enum OrderStatus {
  /** Placed and waiting for the pharmacy to confirm. */
  PLACED = 'PLACED',
  /** Contains prescription-only items: a pharmacist must approve the prescription before fulfilment. */
  PENDING_REVIEW = 'PENDING_REVIEW',
  CONFIRMED = 'CONFIRMED',
  PROCESSING = 'PROCESSING',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

/** No payment provider is integrated yet, so every order is unpaid. */
export enum PaymentStatus {
  UNPAID = 'UNPAID',
}

@Entity('orders')
@Index(['userId', 'createdAt'])
// A retried request with the same client key returns the original order instead of creating another.
@Index('UQ_orders_user_idempotency_key', ['userId', 'idempotencyKey'], {
  unique: true,
  where: '"idempotency_key" IS NOT NULL',
})
@Index('UQ_orders_active_clinical_prescription', ['clinicalPrescriptionId'], {
  unique: true,
  where: `"clinical_prescription_id" IS NOT NULL AND "status" <> 'CANCELLED'`,
})
export class Order extends BaseEntity {
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    enumName: 'order_status_enum',
    default: OrderStatus.PLACED,
  })
  status: OrderStatus;

  /** Sum of line totals, computed server-side from database prices. */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total: string;

  @Column({ type: 'varchar', name: 'payment_status', length: 20, default: PaymentStatus.UNPAID })
  paymentStatus: PaymentStatus;

  /** Full delivery address as one line, kept for display and for orders placed before structured fields. */
  @Column({ type: 'text', name: 'delivery_address' })
  deliveryAddress: string;

  @Column({ type: 'varchar', name: 'delivery_name', length: 100, nullable: true })
  deliveryName?: string | null;

  @Column({ type: 'varchar', name: 'delivery_phone', length: 20, nullable: true })
  deliveryPhone?: string | null;

  @Column({ type: 'varchar', name: 'delivery_city', length: 80, nullable: true })
  deliveryCity?: string | null;

  @Column({ type: 'varchar', name: 'delivery_pincode', length: 6, nullable: true })
  deliveryPincode?: string | null;

  @Column({ type: 'uuid', name: 'prescription_id', nullable: true })
  prescriptionId?: string | null;

  @Column({ type: 'uuid', name: 'clinical_prescription_id', nullable: true })
  clinicalPrescriptionId?: string | null;

  @Column({ type: 'varchar', name: 'cancellation_reason', length: 200, nullable: true })
  cancellationReason?: string | null;

  /** True when any line is a seeded demo product: nothing is paid for or delivered. */
  @Column({ type: 'boolean', name: 'is_demo', default: false })
  isDemo: boolean;

  @Column({ type: 'varchar', name: 'idempotency_key', length: 64, nullable: true })
  idempotencyKey?: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;

  @ManyToOne(() => PrescriptionUpload, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'prescription_id' })
  prescription?: Relation<PrescriptionUpload>;

  @ManyToOne(() => ClinicalPrescription, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'clinical_prescription_id' })
  clinicalPrescription?: Relation<ClinicalPrescription>;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: ['insert'] })
  items: Relation<OrderItem[]>;

  @OneToMany(() => OrderEvent, (event) => event.order)
  events?: Relation<OrderEvent[]>;
}
