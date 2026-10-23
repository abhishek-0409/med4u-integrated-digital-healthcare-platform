export type ConsultationMode = "ONLINE" | "OFFLINE" | "BOTH";

/** A doctor as returned by GET /v1/doctors. */
export interface Doctor {
  id: string;
  name: string;
  specialization: string;
  /** Null when the source did not provide it (shown as "Not provided"). */
  experienceYears: number | null;
  bio: string | null;
  /** Null when not provided; never means free. */
  consultationFee: number | null;
  languages: string[];
  rating: number;
  reviewCount: number;
  /** True only for genuinely verified doctors. Always false for demo profiles. */
  isVerified: boolean;
  /** Seeded demonstration profile (fictional; not a real practitioner). */
  isDemo: boolean;
  /** Fictional staging test profile (development only). Never verified. */
  isStagingFixture?: boolean;
  avatarUrl: string | null;
  /** Backend-supplied gender; used only for demo portrait selection, never inferred from name. */
  gender?: "male" | "female" | "other" | "prefer_not_to_say" | null;
  clinicName: string | null;
  /** Degrees only, e.g. ["MBBS", "MD (Medicine)"]. */
  qualifications: string[];
  city: string | null;
  consultationMode: ConsultationMode;
  isAvailableToday: boolean;
  createdAt: string;
}

export interface EducationEntry {
  degree: string;
  institution?: string | null;
  year?: number | null;
}

/** A doctor as returned by GET /v1/doctors/:id. */
export interface DoctorDetail extends Doctor {
  education: EducationEntry[];
  address: string | null;
  /** Credit line for the photograph, when one was supplied. */
  photoAttribution: string | null;
  experienceBasis: "career_start" | "stated" | "demo" | null;
  experienceSource: string | null;
  /** Null for demo profiles. */
  registration: { council: string; number: string; year: number | null } | null;
  verification: {
    status: "unverified" | "verified" | "rejected";
    verifiedAt: string | null;
    method: string | null;
  };
  /** Where the profile data came from; null for demo profiles. */
  source: { name: string; url: string | null; retrievedAt: string | null } | null;
  updatedAt: string;
}

/** One bookable slot from GET /v1/doctors/:id/availability (clinic-local wall-clock times). */
export interface TimeSlot {
  id: string;
  /** 'YYYY-MM-DD' */
  date: string;
  /** 'HH:MM' */
  startTime: string;
  endTime: string;
  isBooked: boolean;
  /** Server-computed: not booked, not in the past, and the doctor is taking bookings. */
  isAvailable: boolean;
}

export interface DoctorListParams {
  specialization?: string;
  search?: string;
  maxFee?: number;
  consultationMode?: ConsultationMode;
  page?: number;
  limit?: number;
  sortBy?: "rating" | "experience" | "fee";
}
