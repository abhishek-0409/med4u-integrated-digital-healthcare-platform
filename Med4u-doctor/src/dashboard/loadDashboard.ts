import { toDoctorApiError } from "../api/client";
import { AppointmentPage } from "../services/appointmentApi";
import { ApiAppointment, ApiDoctorDetail, ApiTimeSlot } from "../types/appointment";
import {
  AvailabilitySummary,
  buildAvailabilitySummary,
  buildDashboardModel,
  clinicDate,
  clinicWeekday,
  DashboardModel,
} from "./dashboardModel";

export interface DashboardDeps {
  listAppointments(params: { scope?: "upcoming" | "past"; status?: ApiAppointment["status"]; limit?: number }): Promise<AppointmentPage>;
  doctorDetail(doctorId: string): Promise<ApiDoctorDetail>;
  doctorSlots(doctorId: string, date: string): Promise<ApiTimeSlot[]>;
}

export type Section<T> =
  | { status: "ready"; data: T }
  | { status: "error"; message: string };

export interface DashboardResult {
  appointments: Section<DashboardModel>;
  availability: Section<AvailabilitySummary>;
  /** Backend-confirmed verification, or null when the profile could not be read. */
  verified: boolean | null;
  avatarUrl: string | null;
}

const PAGE = 50;

/**
 * Three independent reads: upcoming appointments, completed appointments (for today's tally) and the doctor's
 * public profile/slots. A failure in one never hides the others.
 */
export async function loadDashboard(deps: DashboardDeps, doctorId: string, now: Date = new Date()): Promise<DashboardResult> {
  const appointmentsTask = (async (): Promise<Section<DashboardModel>> => {
    try {
      const [upcoming, completed] = await Promise.all([
        deps.listAppointments({ scope: "upcoming", limit: PAGE }),
        deps.listAppointments({ status: "completed", limit: PAGE }),
      ]);
      return {
        status: "ready",
        data: buildDashboardModel({ upcoming: upcoming.items, upcomingTotal: upcoming.total, completed: completed.items }, now),
      };
    } catch (error) {
      return { status: "error", message: toDoctorApiError(error).message };
    }
  })();

  const profileTask = (async (): Promise<Pick<DashboardResult, "availability" | "verified" | "avatarUrl">> => {
    try {
      const doctor = await deps.doctorDetail(doctorId);
      let slots: ApiTimeSlot[] | null = null;
      // Slots are only worth a request when the doctor has hours today and is taking bookings.
      if (doctor.isAvailableToday && doctor.availabilitySchedule?.[clinicWeekday(now)]) {
        slots = await deps.doctorSlots(doctorId, clinicDate(now)).catch(() => null);
      }
      return {
        availability: { status: "ready", data: buildAvailabilitySummary(doctor, slots, now) },
        verified: doctor.isVerified === true,
        avatarUrl: doctor.avatarUrl ?? null,
      };
    } catch (error) {
      return { availability: { status: "error", message: toDoctorApiError(error).message }, verified: null, avatarUrl: null };
    }
  })();

  const [appointments, profile] = await Promise.all([appointmentsTask, profileTask]);
  return { appointments, ...profile };
}
