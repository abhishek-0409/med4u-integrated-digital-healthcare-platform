import { Appointment } from "../../types/appointment";

/** The upcoming endpoint is already identity-scoped and time-bounded by the backend. */
export function selectUpcomingAppointment(items: Appointment[]): Appointment | null {
  return items
    .filter((appointment) =>
      (appointment.status === "pending" || appointment.status === "confirmed") &&
      appointment.paymentStatus !== "EXPIRED" &&
      appointment.paymentStatus !== "REFUNDED",
    )
    .slice()
    .sort((left, right) => Date.parse(left.appointmentDate) - Date.parse(right.appointmentDate))[0] ?? null;
}

/** The server owns the consultation-window decision; status/type are defense in depth. */
export function canJoinUpcomingAppointment(appointment: Appointment): boolean {
  return appointment.status === "confirmed" && appointment.type === "video" && appointment.canJoin;
}
