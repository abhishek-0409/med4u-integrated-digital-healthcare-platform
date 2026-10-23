import { ConsultationMode } from "./doctor";

/** Mirrors the backend AppointmentStatus enum. */
export type AppointmentStatus =
  "pending" | "confirmed" | "cancelled" | "completed" | "rescheduled";

/** Mirrors the backend AppointmentType enum. */
export type AppointmentType = "video" | "in_person";
export type AppointmentPaymentStatus =
  | "NOT_REQUIRED"
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "EXPIRED"
  | "REFUND_PENDING"
  | "REFUNDED";

export interface AppointmentDoctor {
  id: string;
  name: string;
  specialization: string;
  city: string | null;
  consultationFee: number;
  consultationMode: ConsultationMode;
  avatarUrl?: string | null;
  gender?: "male" | "female" | "other" | "prefer_not_to_say" | null;
  isDemo?: boolean;
}

export interface Appointment {
  id: string;
  status: AppointmentStatus;
  type: AppointmentType;
  /** Clinic-local (IST) 'YYYY-MM-DD'. */
  date: string;
  /** Clinic-local 'HH:MM'. */
  startTime: string;
  endTime: string;
  /** The same start moment as an ISO instant. */
  appointmentDate: string;
  timeZone: string;
  /** Fee captured by the backend when this appointment was booked. */
  consultationFee: number | null;
  paymentStatus: AppointmentPaymentStatus;
  paymentReference: string | null;
  notes: string | null;
  cancellationReason: string | null;
  doctor: AppointmentDoctor;
  /** Present only when the viewer is the doctor. */
  patient?: { id: string; name: string };
  /** Decided by the server; never derive these from the device clock. */
  canJoin: boolean;
  canCancel: boolean;
  createdAt: string;
}

export interface CreateAppointmentRequest {
  doctorId: string;
  slotId: string;
  type?: AppointmentType;
  notes?: string;
}

export interface AppointmentListParams {
  scope?: "upcoming" | "past";
  status?: AppointmentStatus;
  page?: number;
  limit?: number;
}
