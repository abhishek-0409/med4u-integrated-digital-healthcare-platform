export type AppointmentStatus = "confirmed" | "pending" | "completed";
export type AppointmentMode = "Video" | "In person";

export interface DoctorAppointment {
  id: string;
  patientName: string;
  age: number;
  gender: string;
  reason: string;
  date: string;
  time: string;
  mode: AppointmentMode;
  status: AppointmentStatus;
  phone: string;
  notes: string;
}

/** Shape of GET /api/v1/appointments (doctor view). Patient data is limited to id and display name. */
export type ApiAppointmentStatus =
  "pending" | "confirmed" | "cancelled" | "completed" | "rescheduled";
export type ApiAppointmentType = "video" | "in_person";

export interface ApiAppointment {
  id: string;
  status: ApiAppointmentStatus;
  type: ApiAppointmentType;
  /** Clinic wall-clock date (YYYY-MM-DD, IST) and times (HH:MM[:SS]). */
  date: string;
  startTime: string;
  endTime: string;
  timeZone: string;
  notes: string | null;
  doctor?: {
    id: string;
    name: string;
    specialization: string;
    isDemo: boolean;
  };
  patient?: { id: string; name: string };
  /** Server-computed eligibility at response time; the join endpoint re-checks it. */
  canJoin: boolean;
  canCancel: boolean;
}

export interface ApiDaySchedule {
  start?: string;
  end?: string;
  slotDurationMinutes?: number;
  intervals?: Array<{ start: string; end: string }>;
  breakStart?: string;
  breakEnd?: string;
}
export type ApiWeekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

/** Subset of GET /api/v1/doctors/:id used by the dashboard. */
export interface ApiDoctorDetail {
  id: string;
  name: string;
  isAvailableToday: boolean;
  isVerified: boolean;
  avatarUrl: string | null;
  availabilitySchedule: Partial<Record<ApiWeekday, ApiDaySchedule>>;
}

export interface ApiTimeSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  isBooked: boolean;
  isAvailable: boolean;
}

export interface DoctorProfile {
  name: string;
  specialty: string;
  clinic: string;
  email: string;
  phone: string;
  registrationNumber: string;
}
