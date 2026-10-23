import { Appointment } from "../../types/appointment";
import { canJoinUpcomingAppointment, selectUpcomingAppointment } from "./homeAppointment";

const appointment = (overrides: Partial<Appointment> = {}): Appointment => ({
  id: "a1",
  status: "confirmed",
  type: "video",
  date: "2026-10-24",
  startTime: "10:00",
  endTime: "10:30",
  appointmentDate: "2026-10-24T04:30:00.000Z",
  timeZone: "Asia/Kolkata",
  consultationFee: 500,
  paymentStatus: "PAID",
  paymentReference: "pay-1",
  notes: null,
  cancellationReason: null,
  doctor: { id: "doc-1", name: "Dr. Asha Rao", specialization: "Cardiology", city: "Pune", consultationFee: 500, consultationMode: "BOTH" },
  canJoin: false,
  canCancel: true,
  createdAt: "2026-10-20T10:00:00.000Z",
  ...overrides,
});

describe("home appointment selection", () => {
  it("selects the nearest eligible appointment, regardless of response order", () => {
    const later = appointment({ id: "later", appointmentDate: "2026-10-26T04:30:00.000Z" });
    const nearest = appointment({ id: "nearest", appointmentDate: "2026-10-24T04:30:00.000Z" });
    expect(selectUpcomingAppointment([later, nearest])?.id).toBe("nearest");
  });

  it.each(["cancelled", "completed", "rescheduled"] as const)(
    "excludes %s appointments",
    (status) => expect(selectUpcomingAppointment([appointment({ status })])).toBeNull(),
  );

  it("excludes expired payment holds", () => {
    expect(selectUpcomingAppointment([appointment({ status: "pending", paymentStatus: "EXPIRED" })])).toBeNull();
  });

  it("keeps pending payment or confirmation visible but never joinable", () => {
    const pending = appointment({ status: "pending", paymentStatus: "PENDING", canJoin: true });
    expect(selectUpcomingAppointment([pending])).toBe(pending);
    expect(canJoinUpcomingAppointment(pending)).toBe(false);
  });

  it("only allows a confirmed video appointment when the backend permits joining", () => {
    expect(canJoinUpcomingAppointment(appointment({ canJoin: true }))).toBe(true);
    expect(canJoinUpcomingAppointment(appointment({ type: "in_person", canJoin: true }))).toBe(false);
    expect(canJoinUpcomingAppointment(appointment({ status: "pending", canJoin: true }))).toBe(false);
    expect(canJoinUpcomingAppointment(appointment({ canJoin: false }))).toBe(false);
  });
});
