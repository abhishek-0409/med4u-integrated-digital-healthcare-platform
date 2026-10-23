import {
  AppointmentPaymentStatus,
  AppointmentStatus,
  AppointmentType,
} from '../../database/entities/appointment.entity';
import { ConsultationMode } from '../../database/entities/doctor.entity';
import { Gender } from '../../database/entities/user.entity';

export interface AppointmentDoctorSummary {
  id: string;
  name: string;
  specialization: string;
  city: string | null;
  consultationFee: number;
  consultationMode: ConsultationMode;
  avatarUrl: string | null;
  gender: Gender | null;
  isDemo: boolean;
}

export interface AppointmentResponse {
  id: string;
  status: AppointmentStatus;
  type: AppointmentType;
  /** Wall-clock clinic date/time (IST), exactly as the slot was published. */
  date: string;
  startTime: string;
  endTime: string;
  /** The same start moment as an ISO-8601 instant. */
  appointmentDate: string;
  timeZone: string;
  consultationFee: number | null;
  paymentStatus: AppointmentPaymentStatus;
  paymentReference: string | null;
  notes: string | null;
  cancellationReason: string | null;
  doctor: AppointmentDoctorSummary;
  /** Only present when the viewer is the doctor. */
  patient?: { id: string; name: string };
  /** Server-computed eligibility at response time; the join endpoint re-checks it. */
  canJoin: boolean;
  canCancel: boolean;
  createdAt: Date;
}
