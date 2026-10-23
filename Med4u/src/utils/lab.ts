import { LabBooking } from "../types/lab";
import { addClinicDays, todayInClinic } from "./helpers";

/** Slots the server accepts: 08:00–18:00 in 30-minute steps. */
export const LAB_TIME_SLOTS: string[] = Array.from({ length: 21 }, (_, i) => {
  const minutes = 8 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${minutes % 60 === 0 ? "00" : "30"}`;
});

/** Inclusive of today; the server accepts dates up to 60 days ahead. */
export const LAB_BOOKING_DAYS = 61;

/** The next `count` clinic (IST) calendar days, starting today. */
export function upcomingDates(count = LAB_BOOKING_DAYS, today: string = todayInClinic()): string[] {
  return Array.from({ length: count }, (_, i) => addClinicDays(today, i));
}

/** Whether a wall-clock IST slot is still in the future; the server rejects passed slots too. */
export const isSlotInFuture = (date: string, time: string, now: Date = new Date()): boolean =>
  new Date(`${date}T${time}:00+05:30`).getTime() > now.getTime();

export interface LabBookingForm {
  date: string;
  time: string;
  homeCollection: boolean;
  contactName: string;
  contactPhone: string;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
}

/** First problem with the form, or null. Mirrors the server's schema; the server remains the authority. */
export function validateLabBooking(form: LabBookingForm, now: Date = new Date()): string | null {
  if (!form.date) return "Choose a collection date.";
  if (!form.time) return "Choose a time slot.";
  if (!isSlotInFuture(form.date, form.time, now)) return "That time slot has already passed.";
  if (form.contactName.trim().length < 2) return "Enter the patient's name.";
  if (!/^\+?[0-9 -]{8,20}$/.test(form.contactPhone.trim())) return "Enter a valid phone number.";
  if (
    form.homeCollection &&
    (form.addressLine.trim().length < 3 ||
      form.city.trim().length < 2 ||
      form.state.trim().length < 2 ||
      !/^\d{6}$/.test(form.pincode.trim()))
  ) {
    return "Enter the collection address, city, state and six-digit PIN code.";
  }
  return null;
}

const ACTIVE = new Set<LabBooking["status"]>(["pending", "confirmed", "sample_collected", "processing"]);

/** Upcoming = still active and not yet past its date; everything else is previous. */
export function splitBookings(bookings: LabBooking[], now: Date = new Date()) {
  const today = new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
  const upcoming: LabBooking[] = [];
  const previous: LabBooking[] = [];
  for (const b of bookings) (ACTIVE.has(b.status) && b.preferredDate >= today ? upcoming : previous).push(b);
  upcoming.sort((a, b) => `${a.preferredDate}${a.preferredTime}`.localeCompare(`${b.preferredDate}${b.preferredTime}`));
  return { upcoming, previous };
}

export const filterLabTests = <T extends { name: string; category: string; description: string | null }>(
  tests: T[],
  query: string,
  category: string,
  allLabel = "All tests",
): T[] => {
  const q = query.trim().toLowerCase();
  return tests.filter(
    (t) =>
      (category === allLabel || t.category === category) &&
      (!q || `${t.name} ${t.category} ${t.description ?? ""}`.toLowerCase().includes(q)),
  );
};

export const formatLabDate = (date: string): string => {
  const d = new Date(`${date}T00:00:00.000Z`);
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
};
