import {
  ConsultationMode,
  EducationEntry,
  AvailabilitySchedule,
} from '../../database/entities/doctor.entity';
import { Gender } from '../../database/entities/user.entity';

export interface DoctorListItem {
  id: string;
  name: string;
  specialization: string;
  /** Null = not provided. Computed from the career start year when that is known. */
  experienceYears: number | null;
  bio: string | null;
  /** Null = not provided (never implies free). */
  consultationFee: number | null;
  languages: string[];
  rating: number;
  reviewCount: number;
  /** True only for genuinely verified doctors; always false for demo profiles. */
  isVerified: boolean;
  /** Seeded demonstration profile (fictional, not a real practitioner). */
  isDemo: boolean;
  /** Fictional staging test profile (development only). Never verified. */
  isStagingFixture: boolean;
  avatarUrl: string | null;
  gender: Gender | null;
  clinicName: string | null;
  /** Degrees only, e.g. ["MBBS", "MD (Medicine)"]. */
  qualifications: string[];
  city: string | null;
  consultationMode: ConsultationMode;
  isAvailableToday: boolean;
  createdAt: Date;
}

export interface DoctorDetailResponse extends DoctorListItem {
  /** Omitted from public responses; only returned to the doctor themself. */
  licenseNumber?: string;
  education: EducationEntry[];
  availabilitySchedule: AvailabilitySchedule;
  address: string | null;
  /** Credit line for the profile photograph, when one was supplied. */
  photoAttribution: string | null;
  experienceBasis: 'career_start' | 'stated' | 'demo' | null;
  experienceSource: string | null;
  /** Registration details of real profiles; null for demo profiles. */
  registration: { council: string; number: string; year: number | null } | null;
  verification: {
    status: 'unverified' | 'verified' | 'rejected';
    verifiedAt: Date | null;
    method: string | null;
  };
  /** Where the profile data came from; null for demo profiles. */
  source: { name: string; url: string | null; retrievedAt: string | null } | null;
  updatedAt: Date;
}

/** Minimal self-scoped identity and eligibility response for the authenticated doctor app. */
export interface DoctorSelfProfileResponse {
  id: string;
  userId: string;
  name: string;
  specialization: string;
  isVerified: boolean;
  isDemo: boolean;
  isStagingFixture: boolean;
  /** Local-development synthetic login account; its unverified profile is only bookable through its restricted test flow. */
  isDemoAccount: boolean;
  verification: { status: 'unverified' | 'verified' | 'rejected' };
  availabilitySchedule: AvailabilitySchedule;
  licenseStatus: 'provided' | 'missing';
  registrationStatus: 'provided' | 'not_provided';
}

export interface TimeSlotResponse {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  isBooked: boolean;
  /** Bookable right now: not booked, not in the past, and the doctor is taking bookings. */
  isAvailable: boolean;
}
