import { DoctorApiError } from "../api/client";
import { ApiAppointment, ApiDoctorDetail } from "../types/appointment";
import { DashboardDeps, loadDashboard } from "./loadDashboard";

const NOW = new Date("2026-10-17T04:30:00Z");
const appointment: ApiAppointment = {
  id: "a1", status: "confirmed", type: "video", date: "2026-10-17", startTime: "11:00:00", endTime: "11:30:00",
  timeZone: "Asia/Kolkata", notes: null, patient: { id: "p", name: "Aarav Mehta" }, canJoin: true, canCancel: true,
};
const doctor: ApiDoctorDetail = {
  id: "d1", name: "Dr. A", isAvailableToday: true, isVerified: false, avatarUrl: null,
  availabilitySchedule: { saturday: { start: "09:00", end: "17:00" } },
};

function deps(overrides: Partial<DashboardDeps> = {}): DashboardDeps {
  return {
    listAppointments: jest.fn(async (params) => (params.status === "completed" ? { items: [], total: 0 } : { items: [appointment], total: 1 })),
    doctorDetail: jest.fn(async () => doctor),
    doctorSlots: jest.fn(async () => [{ id: "s", date: "2026-10-17", startTime: "12:00:00", endTime: "12:30:00", isBooked: false, isAvailable: true }]),
    ...overrides,
  };
}

describe("loadDashboard", () => {
  it("loads appointments and availability, scoped to the doctor id", async () => {
    const d = deps();
    const result = await loadDashboard(d, "d1", NOW);
    expect(result.appointments.status).toBe("ready");
    expect(result.availability).toMatchObject({ status: "ready", data: { nextSlot: "12:00 PM" } });
    expect(result.verified).toBe(false);
    expect(d.doctorSlots).toHaveBeenCalledWith("d1", "2026-10-17");
    expect(d.listAppointments).toHaveBeenCalledTimes(2);
  });

  it("keeps availability when appointments fail", async () => {
    const result = await loadDashboard(deps({ listAppointments: jest.fn().mockRejectedValue(new DoctorApiError("Server down", 500)) }), "d1", NOW);
    expect(result.appointments).toEqual({ status: "error", message: "Server down" });
    expect(result.availability.status).toBe("ready");
  });

  it("keeps appointments when the profile fails, and reports verification as unknown", async () => {
    const result = await loadDashboard(deps({ doctorDetail: jest.fn().mockRejectedValue(new DoctorApiError("Doctor not found", 404)) }), "d1", NOW);
    expect(result.appointments.status).toBe("ready");
    expect(result.availability).toEqual({ status: "error", message: "Doctor not found" });
    expect(result.verified).toBeNull();
  });

  it("skips the slot request when the doctor is not taking bookings today", async () => {
    const d = deps({ doctorDetail: jest.fn(async () => ({ ...doctor, isAvailableToday: false })) });
    const result = await loadDashboard(d, "d1", NOW);
    expect(d.doctorSlots).not.toHaveBeenCalled();
    expect(result.availability).toMatchObject({ status: "ready", data: { acceptingToday: false, nextSlot: null } });
  });

  it("still shows availability when only the slot lookup fails", async () => {
    const result = await loadDashboard(deps({ doctorSlots: jest.fn().mockRejectedValue(new Error("x")) }), "d1", NOW);
    expect(result.availability).toMatchObject({ status: "ready", data: { hoursToday: "9:00 AM – 5:00 PM", nextSlot: null } });
  });
});
