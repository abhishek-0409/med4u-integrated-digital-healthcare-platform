import { Entity, Column, Index, ManyToOne, JoinColumn, Relation } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';

export enum PrescriptionReviewStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

/** Fixed reasons shown to the patient, so reviewers never have to write sensitive detail. */
export enum PrescriptionRejectionReason {
  ILLEGIBLE = 'ILLEGIBLE',
  EXPIRED = 'EXPIRED',
  INCOMPLETE = 'INCOMPLETE',
  MEDICINE_NOT_COVERED = 'MEDICINE_NOT_COVERED',
  NOT_A_PRESCRIPTION = 'NOT_A_PRESCRIPTION',
  OTHER = 'OTHER',
}

/**
 * A prescription image/PDF submitted by a patient for pharmacist review. The file itself lives in
 * private (encrypted) storage under `storageKey`; there is no URL that serves it without authorization.
 * Approval only records that a pharmacist reviewed it: it is not an authenticity guarantee.
 */
@Entity('prescription_uploads')
@Index(['patientId', 'createdAt'])
@Index(['status', 'createdAt'])
export class PrescriptionUpload extends BaseEntity {
  @Column({ type: 'uuid', name: 'patient_id' })
  patientId: string;

  @Column({ type: 'varchar', name: 'storage_key', length: 64, unique: true })
  storageKey: string;

  @Column({ type: 'varchar', name: 'mime_type', length: 50 })
  mimeType: string;

  @Column({ type: 'int', name: 'size_bytes' })
  sizeBytes: number;

  @Column({ type: 'char', length: 64 })
  sha256: string;

  @Column({
    type: 'enum',
    enum: PrescriptionReviewStatus,
    enumName: 'prescription_upload_status_enum',
    default: PrescriptionReviewStatus.PENDING,
  })
  status: PrescriptionReviewStatus;

  @Column({ type: 'uuid', name: 'reviewed_by', nullable: true })
  reviewedBy?: string | null;

  @Column({ type: 'timestamptz', name: 'reviewed_at', nullable: true })
  reviewedAt?: Date | null;

  @Column({
    type: 'enum',
    enum: PrescriptionRejectionReason,
    enumName: 'prescription_rejection_reason_enum',
    name: 'rejection_reason',
    nullable: true,
  })
  rejectionReason?: PrescriptionRejectionReason | null;

  /** Short optional note visible to the patient. Reviewers are told not to include personal details. */
  @Column({ type: 'varchar', name: 'reviewer_note', length: 200, nullable: true })
  reviewerNote?: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'patient_id' })
  patient: Relation<User>;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'reviewed_by' })
  reviewer?: Relation<User>;
}
