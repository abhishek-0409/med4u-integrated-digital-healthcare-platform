import { Entity, Column, Index, ManyToOne, OneToOne, JoinColumn, Relation } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { Doctor } from './doctor.entity';
import { TimeSlot } from './time-slot.entity';
import { Prescription } from './prescription.entity';

export enum AppointmentType {
  VIDEO = 'video',
  IN_PERSON = 'in_person',
}

export enum AppointmentStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
  RESCHEDULED = 'rescheduled',
}

export enum AppointmentPaymentStatus {
  NOT_REQUIRED = 'NOT_REQUIRED',
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
  REFUND_PENDING = 'REFUND_PENDING',
  REFUNDED = 'REFUNDED',
}

export interface CallLog {
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
}

@Entity('appointments')
@Index(['patientId'])
@Index(['doctorId'])
@Index(['appointmentDate'])
@Index(['status'])
@Index(['doctorId', 'appointmentDate'])
// Double-booking protection at the database level: a slot can back at most one
// live appointment, and a patient can't hold two live appointments at one instant.
// Cancelled/rescheduled rows are excluded so the slot can be booked again.
@Index('UQ_appointments_active_slot', ['slotId'], {
  unique: true,
  where: `"status" NOT IN ('cancelled', 'rescheduled')`,
})
@Index('UQ_appointments_patient_active_time', ['patientId', 'appointmentDate'], {
  unique: true,
  where: `"status" NOT IN ('cancelled', 'rescheduled')`,
})
export class Appointment extends BaseEntity {
  @Column({ type: 'uuid', name: 'patient_id' })
  patientId: string;

  @Column({ type: 'uuid', name: 'doctor_id' })
  doctorId: string;

  @Column({ type: 'uuid', name: 'slot_id' })
  slotId: string;

  @Column({ type: 'timestamptz', name: 'appointment_date' })
  appointmentDate: Date;

  @Column({ type: 'enum', enum: AppointmentType, default: AppointmentType.VIDEO })
  type: AppointmentType;

  @Column({ type: 'enum', enum: AppointmentStatus, default: AppointmentStatus.PENDING })
  status: AppointmentStatus;

  /** Fee captured at booking time so later doctor profile edits do not alter history. */
  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'consultation_fee', nullable: true })
  consultationFee?: number | null;

  @Column({
    type: 'varchar',
    name: 'payment_status',
    length: 20,
    default: AppointmentPaymentStatus.NOT_REQUIRED,
  })
  paymentStatus: AppointmentPaymentStatus;

  @Column({ type: 'varchar', name: 'razorpay_order_id', length: 64, nullable: true })
  razorpayOrderId?: string | null;

  @Column({ type: 'varchar', name: 'razorpay_payment_id', length: 64, nullable: true })
  razorpayPaymentId?: string | null;

  @Column({ type: 'timestamptz', name: 'payment_expires_at', nullable: true })
  paymentExpiresAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'text', name: 'cancellation_reason', nullable: true })
  cancellationReason?: string;

  @Column({ type: 'uuid', name: 'rescheduled_from', nullable: true })
  rescheduledFrom?: string;

  @ManyToOne(() => User, (user) => user.appointments, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'patient_id' })
  patient: Relation<User>;

  @ManyToOne(() => Doctor, (doctor) => doctor.appointments, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'doctor_id' })
  doctor: Relation<Doctor>;

  @ManyToOne(() => TimeSlot, (slot) => slot.appointments, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'slot_id' })
  slot: Relation<TimeSlot>;

  @ManyToOne(() => Appointment, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'rescheduled_from' })
  originalAppointment?: Relation<Appointment>;

  @Column({ type: 'jsonb', name: 'call_log', nullable: true })
  callLog?: CallLog;

  @OneToOne(() => Prescription, (prescription) => prescription.appointment)
  prescription?: Relation<Prescription>;
}
