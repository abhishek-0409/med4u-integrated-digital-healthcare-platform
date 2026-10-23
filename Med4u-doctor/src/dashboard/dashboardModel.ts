import { ApiAppointment, ApiDoctorDetail, ApiTimeSlot, ApiWeekday } from "../types/appointment";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const WEEKDAYS: ApiWeekday[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** The clinic runs on IST; appointment dates are IST wall-clock, so "today" must be too. */
export function clinicDate(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
export function clinicWeekday(now: Date): ApiWeekday {
  return WEEKDAYS[new Date(now.getTime() + IST_OFFSET_MS).getUTCDay()];
}

export function greetingFor(now: Date): string {
  const hour = new Date(now.getTime() + IST_OFFSET_MS).getUTCHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export function formatClock(time: string): string {
  if (time === "24:00") return "12:00 AM (end of day)";
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return time;
  const hours = Number(match[1]);
  return `${hours % 12 === 0 ? 12 : hours % 12}:${match[2]} ${hours >= 12 ? "PM" : "AM"}`;
}

export function formatDayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  const tomorrow = new Date(new Date(`${today}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  if (date === tomorrow) return "Tomorrow";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function displayDoctorName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "Doctor";
  return /^dr\.?\s/i.test(trimmed) ? trimmed : `Dr. ${trimmed}`;
}

export function initialsOf(name: string): string {
  const parts = name.replace(/^dr\.?\s+/i, "").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "D") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function patientDisplayName(appointment: ApiAppointment): string {
  const name = appointment.patient?.name?.trim();
  return name ? name : "Patient";
}

/** Join is offered only when the server says so, and only for a confirmed video appointment. */
export function isJoinEligible(appointment: ApiAppointment): boolean {
  return appointment.canJoin === true && appointment.status === "confirmed" && appointment.type === "video";
}

export const STATUS_LABEL: Record<ApiAppointment["status"], string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
};

export interface DashboardAppointment {
  id: string;
  patientName: string;
  date: string;
  dayLabel: string;
  timeLabel: string;
  startMs: number;
  type: ApiAppointment["type"];
  typeLabel: "Video" | "In person";
  status: ApiAppointment["status"];
  statusLabel: string;
  canJoin: boolean;
}

export function toDashboardAppointment(a: ApiAppointment, today: string): DashboardAppointment {
  const hhmmss = (a.startTime.length === 5 ? `${a.startTime}:00` : a.startTime).slice(0, 8);
  return {
    id: a.id,
    patientName: patientDisplayName(a),
    date: a.date,
    dayLabel: formatDayLabel(a.date, today),
    timeLabel: formatClock(a.startTime),
    startMs: new Date(`${a.date}T${hhmmss}+05:30`).getTime(),
    type: a.type,
    typeLabel: a.type === "video" ? "Video" : "In person",
    status: a.status,
    statusLabel: STATUS_LABEL[a.status] ?? a.status,
    canJoin: isJoinEligible(a),
  };
}

export interface AvailabilitySummary {
  acceptingToday: boolean;
  /** e.g. "9:00 AM – 5:00 PM"; null when no hours are configured for today. */
  hoursToday: string | null;
  /** First bookable slot today; null when none remain (never guessed). */
  nextSlot: string | null;
}

export interface DashboardModel {
  today: string;
  /** Soonest live appointment (today or later). */
  next: DashboardAppointment | null;
  todayList: DashboardAppointment[];
  counts: { today: number; pending: number; completed: number };
  /** True when more records exist than were fetched, so pending is a lower bound ("50+"). */
  pendingIsLowerBound: boolean;
}

export function buildDashboardModel(
  input: { upcoming: ApiAppointment[]; upcomingTotal: number; completed: ApiAppointment[] },
  now: Date,
): DashboardModel {
  const today = clinicDate(now);
  const upcoming = input.upcoming
    .filter((a) => a.status === "pending" || a.status === "confirmed")
    .map((a) => toDashboardAppointment(a, today))
    .sort((a, b) => a.startMs - b.startMs);
  const completedToday = input.completed
    .filter((a) => a.status === "completed" && a.date === today)
    .map((a) => toDashboardAppointment(a, today));
  const todayList = [...upcoming.filter((a) => a.date === today), ...completedToday].sort((a, b) => a.startMs - b.startMs);
  return {
    today,
    next: upcoming[0] ?? null,
    todayList,
    counts: {
      today: todayList.length,
      pending: upcoming.filter((a) => a.status === "pending").length,
      completed: completedToday.length,
    },
    pendingIsLowerBound: input.upcomingTotal > input.upcoming.length,
  };
}

export function buildAvailabilitySummary(doctor: ApiDoctorDetail, slots: ApiTimeSlot[] | null, now: Date): AvailabilitySummary {
  const day = doctor.availabilitySchedule?.[clinicWeekday(now)];
  const first = slots?.filter((s) => s.isAvailable).sort((a, b) => a.startTime.localeCompare(b.startTime))[0];
  return {
    acceptingToday: doctor.isAvailableToday,
    hoursToday: day ? day.intervals?.length
      ? `${formatClock(day.intervals[0].start)} – ${formatClock(day.intervals[day.intervals.length - 1].end)}`
      : day.start && day.end ? `${formatClock(day.start)} – ${formatClock(day.end)}` : null : null,
    nextSlot: first ? formatClock(first.startTime) : null,
  };
}
