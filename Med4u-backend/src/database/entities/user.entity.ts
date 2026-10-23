import { Entity, Column, Index, OneToOne, OneToMany, Relation } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Doctor } from './doctor.entity';
import { Appointment } from './appointment.entity';
import { Session } from './session.entity';
import { Notification } from './notification.entity';
import { Review } from './review.entity';
import { LabBooking } from './lab-booking.entity';

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
  PREFER_NOT_TO_SAY = 'prefer_not_to_say',
}

export enum BloodGroup {
  A_POS = 'A+',
  A_NEG = 'A-',
  B_POS = 'B+',
  B_NEG = 'B-',
  AB_POS = 'AB+',
  AB_NEG = 'AB-',
  O_POS = 'O+',
  O_NEG = 'O-',
  UNKNOWN = 'unknown',
}

export enum UserRole {
  PATIENT = 'patient',
  DOCTOR = 'doctor',
  ADMIN = 'admin',
  /** Reviews prescriptions and moves pharmacy orders through fulfilment. */
  PHARMACIST = 'pharmacist',
}

@Entity('users')
@Index(['phone'])
@Index(['email'])
@Index(['role'])
export class User extends BaseEntity {
  @Column({ type: 'varchar', length: 20, unique: true })
  phone: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 150, nullable: true, unique: true })
  email?: string;

  @Column({ type: 'varchar', name: 'avatar_url', nullable: true })
  avatarUrl?: string;

  @Column({ type: 'date', name: 'dob', nullable: true })
  /** Calendar date as 'YYYY-MM-DD' (Postgres date columns are returned as strings). */
  dob?: string;

  @Column({ type: 'enum', enum: Gender, nullable: true })
  gender?: Gender;

  @Column({ type: 'enum', enum: BloodGroup, name: 'blood_group', nullable: true })
  bloodGroup?: BloodGroup;

  /** Optional self-reported height in centimetres. Numeric columns arrive as strings; see the transformer. */
  @Column({
    type: 'numeric',
    precision: 5,
    scale: 1,
    name: 'height_cm',
    nullable: true,
    transformer: { to: (v?: number | null) => v, from: (v?: string | null) => (v == null ? v : Number(v)) },
  })
  heightCm?: number | null;

  /** Optional self-reported weight in kilograms. */
  @Column({
    type: 'numeric',
    precision: 5,
    scale: 1,
    name: 'weight_kg',
    nullable: true,
    transformer: { to: (v?: number | null) => v, from: (v?: string | null) => (v == null ? v : Number(v)) },
  })
  weightKg?: number | null;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.PATIENT })
  role: UserRole;

  @Column({ type: 'varchar', name: 'fcm_token', nullable: true })
  fcmToken?: string;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'boolean', name: 'is_verified', default: false })
  isVerified: boolean;

  // Relation<T> prevents emitDecoratorMetadata from resolving the class at
  // module-load time, which would crash on circular entity imports.
  @OneToOne(() => Doctor, (doctor) => doctor.user)
  doctor?: Relation<Doctor>;

  @OneToMany(() => Appointment, (appointment) => appointment.patient)
  appointments?: Relation<Appointment[]>;

  @OneToMany(() => Session, (session) => session.user)
  sessions?: Relation<Session[]>;

  @OneToMany(() => Notification, (notification) => notification.user)
  notifications?: Relation<Notification[]>;

  @OneToMany(() => Review, (review) => review.patient)
  reviews?: Relation<Review[]>;

  @OneToMany(() => LabBooking, (booking) => booking.user)
  labBookings?: Relation<LabBooking[]>;
}
