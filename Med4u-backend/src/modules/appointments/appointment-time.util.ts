import { AppointmentStatus, AppointmentType } from '../../database/entities/appointment.entity';

/**
 * Time slots are stored as wall-clock date + time with no zone. Med4U serves Indian clinics,
 * so they are interpreted in IST (UTC+05:30, no DST). Every conversion goes through here.
 */
export const CLINIC_TIME_ZONE = 'Asia/Kolkata';
const IST_OFFSET_MS = 330 * 60_000;

/** Patients may open the call this long before the slot starts... */
export const JOIN_EARLY_MS = 10 * 60_000;
/** ...and up to this long after the slot ends. */
export const JOIN_LATE_MS = 15 * 60_000;
/** How far ahead appointments can be booked. */
export const MAX_ADVANCE_DAYS = 60;

const HH_MM = /^(\d{2}):(\d{2})/;

/** Normalises 'HH:MM' or 'HH:MM:SS' to 'HH:MM'. */
export function toHhMm(time: string): string {
  const match = HH_MM.exec(time);
  return match ? `${match[1]}:${match[2]}` : time;
}

/** The instant a wall-clock IST date ('YYYY-MM-DD') and time ('HH:MM[:SS]') refers to. */
export function toInstant(date: string, time: string): Date {
  return new Date(`${date}T${toHhMm(time)}:00+05:30`);
}

/** Today's calendar date in IST as 'YYYY-MM-DD'. */
export function todayInClinic(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' shifted by `days`, calendar-safe. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whether a clinic-local calendar date falls within the inclusive booking window. */
export function isWithinBookingWindow(date: string, clinicToday = todayInClinic()): boolean {
  return date >= clinicToday && date <= addDays(clinicToday, MAX_ADVANCE_DAYS);
}

/** 'HH:MM' wall-clock time in IST for an instant. */
export function clinicTimeOf(instant: Date): string {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(11, 16);
}

export interface TimedAppointment {
  status: AppointmentStatus;
  type: AppointmentType;
  date: string;
  startTime: string;
  endTime: string;
}

const LIVE_STATUSES: AppointmentStatus[] = [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED];

/** Video call is joinable only for confirmed video appointments, inside the join window. */
export function canJoinConsultation(appt: TimedAppointment, now: Date = new Date()): boolean {
  if (appt.status !== AppointmentStatus.CONFIRMED || appt.type !== AppointmentType.VIDEO) {
    return false;
  }
  const start = toInstant(appt.date, appt.startTime).getTime();
  const end = toInstant(appt.date, appt.endTime).getTime();
  const t = now.getTime();
  return t >= start - JOIN_EARLY_MS && t <= end + JOIN_LATE_MS;
}

/** Live appointments can be cancelled until they start. */
export function canCancelAppointment(appt: TimedAppointment, now: Date = new Date()): boolean {
  return (
    LIVE_STATUSES.includes(appt.status) &&
    now.getTime() < toInstant(appt.date, appt.startTime).getTime()
  );
}
