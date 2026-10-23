import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { ConsultationMode } from './doctor.entity';

/**
 * A request to become a doctor. It lives apart from `doctors`: nothing here is bookable, listed or able to
 * hold a doctor role. Only a human reviewer's APPROVED decision creates a `doctors` row (see the service).
 */
export enum DoctorApplicationStatus {
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  UNDER_REVIEW = 'UNDER_REVIEW',
  /** The reviewer needs more documents or corrections; the applicant may resubmit. */
  NEEDS_INFO = 'NEEDS_INFO',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum RegistryCheck {
  /** The reviewer looked the practitioner up in an official medical register. */
  VERIFIED_AGAINST_OFFICIAL_REGISTER = 'VERIFIED_AGAINST_OFFICIAL_REGISTER',
  /** No official register could be consulted; the reason is recorded. Documents alone were reviewed. */
  REGISTER_UNAVAILABLE = 'REGISTER_UNAVAILABLE',
}

/** The review target. A target, not a guarantee, and never an automatic approval. */
export const REVIEW_TARGET_HOURS = 24;

@Entity('doctor_applications')
@Index(['status', 'reviewDeadlineAt'])
export class DoctorApplication extends BaseEntity {
  @Column({ type: 'uuid', name: 'user_id', unique: true })
  userId: string;

  @Column({ type: 'varchar', length: 24, default: DoctorApplicationStatus.PENDING_VERIFICATION })
  status: DoctorApplicationStatus;

  @Column({ type: 'varchar', name: 'full_name', length: 100 })
  fullName: string;

  /** Collected as contact information only. This system has no email verification, so it is never "verified". */
  @Column({ type: 'varchar', length: 150 })
  email: string;

  @Column({ type: 'varchar', name: 'registration_number', length: 50 })
  registrationNumber: string;

  @Column({ type: 'varchar', name: 'registration_council', length: 120 })
  registrationCouncil: string;

  @Column({ type: 'varchar', length: 100 })
  qualification: string;

  @Column({ type: 'varchar', name: 'medical_college', length: 150 })
  medicalCollege: string;

  @Column({ type: 'varchar', length: 100 })
  specialization: string;

  @Column({ type: 'varchar', name: 'clinic_name', length: 150 })
  clinicName: string;

  @Column({ type: 'varchar', name: 'clinic_address', length: 300 })
  clinicAddress: string;

  @Column({ type: 'varchar', length: 100 })
  city: string;

  @Column({ type: 'varchar', name: 'consultation_mode', length: 10 })
  consultationMode: ConsultationMode;

  @Column({ type: 'timestamptz', name: 'submitted_at' })
  submittedAt: Date;

  /** submitted_at + 24h, enforced by a CHECK constraint. Overdue applications are flagged, never auto-decided. */
  @Column({ type: 'timestamptz', name: 'review_deadline_at' })
  reviewDeadlineAt: Date;

  @Column({ type: 'int', name: 'resubmission_count', default: 0 })
  resubmissionCount: number;

  /** Set by the reviewer on rejection; NEEDS_INFO always allows resubmission. */
  @Column({ type: 'boolean', name: 'resubmission_allowed', default: false })
  resubmissionAllowed: boolean;

  @Column({ type: 'uuid', name: 'reviewer_id', nullable: true })
  reviewerId?: string | null;

  @Column({ type: 'timestamptz', name: 'decided_at', nullable: true })
  decidedAt?: Date | null;

  /** Internal reviewer notes. Never returned to the applicant. */
  @Column({ type: 'text', name: 'reviewer_notes', nullable: true })
  reviewerNotes?: string | null;

  /** The reason / requested information shown to the applicant. */
  @Column({ type: 'text', name: 'applicant_message', nullable: true })
  applicantMessage?: string | null;

  @Column({ type: 'varchar', name: 'registry_check', length: 40, nullable: true })
  registryCheck?: RegistryCheck | null;

  @Column({ type: 'varchar', name: 'registry_source', length: 200, nullable: true })
  registrySource?: string | null;

  @Column({ type: 'varchar', name: 'registry_reference', length: 200, nullable: true })
  registryReference?: string | null;

  /** The doctors row created on approval. */
  @Column({ type: 'uuid', name: 'doctor_id', nullable: true })
  doctorId?: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;
}
