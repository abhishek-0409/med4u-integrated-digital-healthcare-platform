import {
  Entity,
  Column,
  Index,
  OneToOne,
  JoinColumn,
  OneToMany,
  Relation,
} from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { TimeSlot } from './time-slot.entity';
import { Appointment } from './appointment.entity';
import { Review } from './review.entity';

export enum ConsultationMode {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  BOTH = 'BOTH',
}

export interface EducationEntry {
  degree: string;
  /** Absent when the source did not supply it (never invented). */
  institution?: string | null;
  year?: number | null;
}

export interface DaySchedule {
  /** Legacy single interval fields remain readable for existing profiles. */
  start?: string;
  end?: string;
  slotDurationMinutes?: number;
  breakStart?: string;
  breakEnd?: string;
  intervals?: Array<{ start: string; end: string }>;
}

export type AvailabilitySchedule = Partial<
  Record<
    'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday',
    DaySchedule
  >
>;

@Entity('doctors')
@Index(['userId'])
@Index(['specialization'])
@Index(['rating'])
export class Doctor extends BaseEntity {
  @Column({ type: 'uuid', name: 'user_id', unique: true })
  userId: string;

  @Column({ type: 'varchar', length: 100 })
  specialization: string;

  @Column({ type: 'varchar', name: 'license_number', length: 50, unique: true })
  licenseNumber: string;

  @Column({ type: 'int', name: 'experience_years', nullable: true, default: 0 })
  experienceYears?: number | null;

  @Column({ type: 'text', nullable: true })
  bio?: string;

  /** Null = not provided (imported real doctors); never treated as free. */
  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'consultation_fee', nullable: true, default: 0 })
  consultationFee: number | null;

  @Column({ type: 'simple-array', default: '' })
  languages: string[];

  @Column({ type: 'jsonb', default: '[]' })
  education: EducationEntry[];

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  rating: number;

  @Column({ type: 'int', name: 'review_count', default: 0 })
  reviewCount: number;

  @Column({ type: 'boolean', name: 'is_verified', default: false })
  isVerified: boolean;

  @Column({ type: 'jsonb', name: 'availability_schedule', default: '{}' })
  availabilitySchedule: AvailabilitySchedule;

  @Index()
  @Column({ type: 'varchar', length: 100, nullable: true })
  city?: string;

  @Column({ type: 'boolean', name: 'is_available_today', default: true })
  isAvailableToday: boolean;

  /** Seeded demonstration profile. Never verified, never a real practitioner. */
  @Column({ type: 'boolean', name: 'is_demo', default: false })
  isDemo: boolean;

  /**
   * Fictional staging test fixture (never verified, never has a registration number: database constraint).
   * Eligible for booking only in a development environment that opted in; see doctor-eligibility.ts.
   */
  @Column({ type: 'boolean', name: 'is_staging_fixture', default: false })
  isStagingFixture: boolean;

  @Column({ type: 'varchar', name: 'clinic_name', length: 150, nullable: true })
  clinicName?: string;

  @Column({
    type: 'enum',
    enum: ConsultationMode,
    name: 'consultation_mode',
    default: ConsultationMode.BOTH,
  })
  consultationMode: ConsultationMode;

  // ── Provenance of real (non-demo) profiles ─────────────────────────────────

  @Column({ type: 'varchar', name: 'registration_council', length: 120, nullable: true })
  registrationCouncil?: string | null;

  @Column({ type: 'varchar', name: 'registration_number', length: 50, nullable: true })
  registrationNumber?: string | null;

  @Column({ type: 'smallint', name: 'registration_year', nullable: true })
  registrationYear?: number | null;

  /** When known, experience is computed from this rather than stored. */
  @Column({ type: 'smallint', name: 'career_start_year', nullable: true })
  careerStartYear?: number | null;

  /** Where a stated `experience_years` value came from. */
  @Column({ type: 'varchar', name: 'experience_source', length: 200, nullable: true })
  experienceSource?: string | null;

  @Column({ type: 'text', nullable: true })
  address?: string | null;

  @Column({ type: 'varchar', name: 'photo_attribution', length: 200, nullable: true })
  photoAttribution?: string | null;

  @Column({ type: 'varchar', name: 'profile_source', length: 120, nullable: true })
  profileSource?: string | null;

  @Column({ type: 'varchar', name: 'profile_source_url', length: 500, nullable: true })
  profileSourceUrl?: string | null;

  @Column({ type: 'date', name: 'profile_source_retrieved_at', nullable: true })
  profileSourceRetrievedAt?: string | null;

  /** Free-text statement of the permission/licence under which the data may be used. */
  @Column({ type: 'varchar', name: 'profile_source_permission', length: 300, nullable: true })
  profileSourcePermission?: string | null;

  @Column({ type: 'varchar', name: 'verification_status', length: 16, default: 'unverified' })
  verificationStatus: 'unverified' | 'verified' | 'rejected';

  @Column({ type: 'timestamptz', name: 'verified_at', nullable: true })
  verifiedAt?: Date | null;

  @Column({ type: 'varchar', name: 'verified_by', length: 120, nullable: true })
  verifiedBy?: string | null;

  @Column({ type: 'varchar', name: 'verification_method', length: 60, nullable: true })
  verificationMethod?: string | null;

  @Column({ type: 'varchar', name: 'verification_reference', length: 200, nullable: true })
  verificationReference?: string | null;

  @OneToOne(() => User, (user) => user.doctor, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;

  @OneToMany(() => TimeSlot, (slot) => slot.doctor)
  timeSlots?: Relation<TimeSlot[]>;

  @OneToMany(() => Appointment, (appointment) => appointment.doctor)
  appointments?: Relation<Appointment[]>;

  @OneToMany(() => Review, (review) => review.doctor)
  reviews?: Relation<Review[]>;
}
