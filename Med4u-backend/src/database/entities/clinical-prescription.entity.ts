import { Entity, Column, Index, ManyToOne, JoinColumn, Relation } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Appointment } from './appointment.entity';
import { Doctor } from './doctor.entity';
import { User } from './user.entity';

export enum ClinicalPrescriptionStatus {
  DRAFT = 'draft',
  ISSUED = 'issued',
  /** Replaced by an issued amendment. The content is kept for the record. */
  SUPERSEDED = 'superseded',
  CANCELLED = 'cancelled',
}

export const MEDICINE_ROUTES = [
  'oral',
  'sublingual',
  'topical',
  'inhalation',
  'nasal',
  'ophthalmic',
  'otic',
  'rectal',
  'vaginal',
  'intramuscular',
  'subcutaneous',
  'intravenous',
  'other',
] as const;
export type MedicineRoute = (typeof MEDICINE_ROUTES)[number];

export const FOOD_RELATIONS = [
  'before_food',
  'after_food',
  'with_food',
  'empty_stomach',
  'not_applicable',
] as const;
export type FoodRelation = (typeof FOOD_RELATIONS)[number];

export const DOSAGE_FORMS = [
  'tablet',
  'capsule',
  'syrup',
  'suspension',
  'injection',
  'drops',
  'ointment',
  'cream',
  'gel',
  'lotion',
  'inhaler',
  'powder',
  'spray',
  'patch',
  'other',
] as const;

export const TIMINGS = ['morning', 'afternoon', 'evening', 'night'] as const;

export interface PrescribedMedicine {
  /** Set when the doctor picked the entry from the trusted medicine catalog. */
  catalogMedicineId: string | null;
  source: 'catalog' | 'manual';
  name: string;
  genericName: string | null;
  strength: string;
  dosageForm: (typeof DOSAGE_FORMS)[number];
  dose: string;
  route: MedicineRoute;
  frequency: string;
  durationValue: number;
  durationUnit: 'days' | 'weeks' | 'months';
  quantity: number;
  quantityUnit: string | null;
  timing: Array<(typeof TIMINGS)[number]>;
  foodRelation: FoodRelation;
  instructions: string | null;
}

/** Catalog-linked lab recommendation with trusted catalog instructions snapshotted at draft time. */
export interface PrescribedTest {
  labTestId: string;
  name: string;
  preparationInstructions: string | null;
  clinicalInstructions: string | null;
}

/** Identity of the issuing doctor, frozen at issue time so later profile edits cannot rewrite the document. */
export interface DoctorSnapshot {
  name: string;
  specialization: string;
  clinicName: string | null;
  /** Present only when the doctor profile is verified and has a stored registration number. */
  registrationNumber: string | null;
  registrationCouncil: string | null;
  registrationVerified: boolean;
  isDemo: boolean;
}

/**
 * A structured prescription written by a doctor after a completed consultation. Distinct from the legacy
 * file-based `prescriptions` table (left untouched). Once issued the clinical content is immutable: the
 * database rejects any change (see the ClinicalPrescriptions migration) and corrections create a new,
 * linked version that supersedes the original.
 */
@Entity('clinical_prescriptions')
@Index(['patientId', 'status'])
@Index(['doctorId'])
@Index(['appointmentId'])
export class ClinicalPrescription extends BaseEntity {
  @Column({ type: 'uuid', name: 'appointment_id' })
  appointmentId: string;

  @Column({ type: 'uuid', name: 'doctor_id' })
  doctorId: string;

  @Column({ type: 'uuid', name: 'patient_id' })
  patientId: string;

  @Column({
    type: 'enum',
    enum: ClinicalPrescriptionStatus,
    enumName: 'clinical_prescription_status_enum',
    default: ClinicalPrescriptionStatus.DRAFT,
  })
  status: ClinicalPrescriptionStatus;

  /** 1 for the first prescription of an appointment, +1 for every amendment. */
  @Column({ type: 'int', default: 1 })
  version: number;

  /** Increments on every draft save so a stale "issue" request cannot issue content the doctor did not review. */
  @Column({ type: 'int', default: 1 })
  revision: number;

  @Column({ type: 'text', nullable: true })
  diagnosis?: string | null;

  @Column({ type: 'jsonb', default: () => `'[]'` })
  medicines: PrescribedMedicine[];

  @Column({ type: 'jsonb', name: 'recommended_tests', default: () => `'[]'` })
  recommendedTests: PrescribedTest[];

  @Column({ type: 'text', name: 'additional_instructions', nullable: true })
  additionalInstructions?: string | null;

  /** Warnings and patient-specific instructions (allergies, interactions, red-flag symptoms). */
  @Column({ type: 'text', nullable: true })
  warnings?: string | null;

  @Column({ type: 'date', name: 'follow_up_date', nullable: true })
  followUpDate?: string | null;

  // ── Issuance ──────────────────────────────────────────────────────────────

  @Column({ type: 'timestamptz', name: 'issued_at', nullable: true })
  issuedAt?: Date | null;

  /** User id of the issuing doctor, taken from the authenticated session. */
  @Column({ type: 'uuid', name: 'issued_by', nullable: true })
  issuedBy?: string | null;

  /** SHA-256 of the canonical clinical content at issue time (tamper evidence; NOT a digital signature). */
  @Column({ type: 'char', length: 64, name: 'content_hash', nullable: true })
  contentHash?: string | null;

  @Column({ type: 'jsonb', name: 'doctor_snapshot', nullable: true })
  doctorSnapshot?: DoctorSnapshot | null;

  // ── Amendment chain ───────────────────────────────────────────────────────

  @Column({ type: 'uuid', name: 'supersedes_id', nullable: true })
  supersedesId?: string | null;

  @Column({ type: 'uuid', name: 'superseded_by_id', nullable: true })
  supersededById?: string | null;

  @Column({ type: 'varchar', name: 'amendment_reason', length: 300, nullable: true })
  amendmentReason?: string | null;

  @Column({ type: 'timestamptz', name: 'cancelled_at', nullable: true })
  cancelledAt?: Date | null;

  @Column({ type: 'varchar', name: 'cancellation_reason', length: 300, nullable: true })
  cancellationReason?: string | null;

  @ManyToOne(() => Appointment, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'appointment_id' })
  appointment: Relation<Appointment>;

  @ManyToOne(() => Doctor, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'doctor_id' })
  doctor: Relation<Doctor>;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'patient_id' })
  patient: Relation<User>;
}
