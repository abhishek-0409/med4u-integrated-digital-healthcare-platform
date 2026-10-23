import { ApiAppointment, ApiDoctorDetail } from "../types/appointment";
import {
  buildAvailabilitySummary,
  buildDashboardModel,
  clinicDate,
  displayDoctorName,
  formatClock,
  greetingFor,
  initialsOf,
  isJoinEligible,
} from "./dashboardModel";

// 2026-10-17 10:00 IST
const NOW = new Date("2026-10-17T04:30:00Z");

function appt(overrides: Partial<ApiAppointment> = {}): ApiAppointment {
  return {
    id: "a1", status: "confirmed", type: "video", date: "2026-10-17", startTime: "11:00:00", endTime: "11:30:00",
    timeZone: "Asia/Kolkata", notes: null, patient: { id: "p1", name: "Aarav Mehta" }, canJoin: false, canCancel: true,
    ...overrides,
  };
}

describe("clinic time helpers", () => {
  it("derives today in IST, not UTC", () => {
    expect(clinicDate(new Date("2026-10-16T19:00:00Z"))).toBe("2026-10-17");
    expect(clinicDate(new Date("2026-10-16T18:00:00Z"))).toBe("2026-10-16");
  });
  it("formats clock times and greetings", () => {
    expect(formatClock("09:30:00")).toBe("9:30 AM");
    expect(formatClock("00:05")).toBe("12:05 AM");
    expect(formatClock("14:15:00")).toBe("2:15 PM");
    expect(greetingFor(NOW)).toBe("Good morning");
    expect(greetingFor(new Date("2026-10-17T10:00:00Z"))).toBe("Good afternoon");
    expect(greetingFor(new Date("2026-10-17T14:00:00Z"))).toBe("Good evening");
  });
  it("formats the doctor's name once with a Dr. prefix", () => {
    expect(displayDoctorName("Priya Sharma")).toBe("Dr. Priya Sharma");
    expect(displayDoctorName("Dr. Priya Sharma")).toBe("Dr. Priya Sharma");
    expect(displayDoctorName("  ")).toBe("Doctor");
    expect(initialsOf("Dr. Priya Sharma")).toBe("PS");
  });
});

describe("isJoinEligible", () => {
  it("requires the server flag, a confirmed status and a video appointment", () => {
    expect(isJoinEligible(appt({ canJoin: true }))).toBe(true);
    expect(isJoinEligible(appt({ canJoin: false }))).toBe(false);
    expect(isJoinEligible(appt({ canJoin: true, type: "in_person" }))).toBe(false);
    expect(isJoinEligible(appt({ canJoin: true, status: "pending" }))).toBe(false);
    expect(isJoinEligible(appt({ canJoin: undefined as unknown as boolean }))).toBe(false);
  });
});

describe("buildDashboardModel", () => {
  it("maps counts, the next appointment and today's list from API data", () => {
    const model = buildDashboardModel({
      upcoming: [
        appt({ id: "later", date: "2026-10-18", startTime: "09:00:00" }),
        appt({ id: "p", status: "pending", startTime: "12:00:00", patient: { id: "p2", name: "Ananya Rao" }, type: "in_person" }),
        appt({ id: "soon", startTime: "11:00:00", canJoin: true }),
      ],
      upcomingTotal: 3,
      completed: [
        appt({ id: "done", status: "completed", startTime: "08:00:00" }),
        appt({ id: "old", status: "completed", date: "2026-10-10" }),
      ],
    }, NOW);
    expect(model.counts).toEqual({ today: 3, pending: 1, completed: 1 });
    expect(model.next?.id).toBe("soon");
    expect(model.next?.canJoin).toBe(true);
    expect(model.next?.timeLabel).toBe("11:00 AM");
    expect(model.todayList.map((a) => a.id)).toEqual(["done", "soon", "p"]);
    expect(model.todayList[2]).toMatchObject({ patientName: "Ananya Rao", typeLabel: "In person", statusLabel: "Pending" });
    expect(model.pendingIsLowerBound).toBe(false);
  });

  it("returns an honest empty model", () => {
    const model = buildDashboardModel({ upcoming: [], upcomingTotal: 0, completed: [] }, NOW);
    expect(model.next).toBeNull();
    expect(model.todayList).toEqual([]);
    expect(model.counts).toEqual({ today: 0, pending: 0, completed: 0 });
  });

  it("falls back to a safe patient name and flags truncated pages", () => {
    const model = buildDashboardModel({ upcoming: [appt({ patient: undefined })], upcomingTotal: 80, completed: [] }, NOW);
    expect(model.next?.patientName).toBe("Patient");
    expect(model.pendingIsLowerBound).toBe(true);
  });

  it("ignores cancelled appointments", () => {
    const model = buildDashboardModel({ upcoming: [appt({ status: "cancelled" })], upcomingTotal: 1, completed: [] }, NOW);
    expect(model.next).toBeNull();
    expect(model.counts.today).toBe(0);
  });
});

describe("buildAvailabilitySummary", () => {
  const doctor: ApiDoctorDetail = {
    id: "d1", name: "Dr. A", isAvailableToday: true, isVerified: true, avatarUrl: null,
    availabilitySchedule: { saturday: { start: "09:00", end: "17:00", slotDurationMinutes: 30 } },
  };
  it("reports hours and the first open slot", () => {
    const slots = [
      { id: "2", date: "2026-10-17", startTime: "13:00:00", endTime: "13:30:00", isBooked: false, isAvailable: true },
      { id: "1", date: "2026-10-17", startTime: "10:30:00", endTime: "11:00:00", isBooked: false, isAvailable: true },
      { id: "0", date: "2026-10-17", startTime: "09:00:00", endTime: "09:30:00", isBooked: true, isAvailable: false },
    ];
    expect(buildAvailabilitySummary(doctor, slots, NOW)).toEqual({ acceptingToday: true, hoursToday: "9:00 AM – 5:00 PM", nextSlot: "10:30 AM" });
  });
  it("never invents a slot", () => {
    expect(buildAvailabilitySummary({ ...doctor, availabilitySchedule: {} }, null, NOW)).toEqual({ acceptingToday: true, hoursToday: null, nextSlot: null });
  });
});
