import { LabBooking } from "../types/lab";
import { filterLabTests, isSlotInFuture, LAB_TIME_SLOTS, splitBookings, upcomingDates, validateLabBooking } from "./lab";

const now = new Date("2030-01-10T10:00:00Z");
const form = { date: "2030-01-11", time: "09:00", homeCollection: false, contactName: "Asha Patel", contactPhone: "+919876543210", addressLine: "", city: "", state: "", pincode: "" };
const booking = (o: Partial<LabBooking>): LabBooking => ({
  id: "1", reference: "LAB-1", testId: "t", preferredDate: "2030-01-12", preferredTime: "09:00", homeCollection: false,
  status: "pending", priceSnapshot: 250, createdAt: "", test: { name: "CBC", category: "Blood", isDemo: true }, ...o,
});

describe("lab utils", () => {
  it("offers only slots the server accepts", () => {
    expect(LAB_TIME_SLOTS[0]).toBe("08:00");
    expect(LAB_TIME_SLOTS[LAB_TIME_SLOTS.length - 1]).toBe("18:00");
    LAB_TIME_SLOTS.forEach((t) => expect(t).toMatch(/^(0[8-9]|1[0-8]):(00|30)$/));
  });
  it("lists consecutive dates from today", () => {
    expect(upcomingDates(3, "2030-01-10")).toEqual(["2030-01-10", "2030-01-11", "2030-01-12"]);
  });
  it("detects passed slots", () => {
    // 10:00 UTC is 15:30 IST.
    expect(isSlotInFuture("2030-01-10", "15:00", now)).toBe(false);
    expect(isSlotInFuture("2030-01-10", "16:00", now)).toBe(true);
    // 21:32 IST: 8 PM has passed even though 20:00 UTC has not.
    const night = new Date("2030-01-10T16:02:00Z");
    expect(isSlotInFuture("2030-01-10", "20:00", night)).toBe(false);
    expect(isSlotInFuture("2030-01-10", "08:00", night)).toBe(false);
  });
  it("validates the booking form", () => {
    expect(validateLabBooking(form, now)).toBeNull();
    expect(validateLabBooking({ ...form, date: "" }, now)).toMatch(/date/i);
    expect(validateLabBooking({ ...form, time: "" }, now)).toMatch(/slot/i);
    expect(validateLabBooking({ ...form, date: "2030-01-10", time: "09:00" }, now)).toMatch(/passed/i);
    expect(validateLabBooking({ ...form, contactName: "A" }, now)).toMatch(/name/i);
    expect(validateLabBooking({ ...form, contactPhone: "12" }, now)).toMatch(/phone/i);
    expect(validateLabBooking({ ...form, homeCollection: true }, now)).toMatch(/address/i);
    expect(validateLabBooking({ ...form, homeCollection: true, addressLine: "1 Main St", city: "Pune", state: "MH", pincode: "411001" }, now)).toBeNull();
  });
  it("splits upcoming from previous bookings", () => {
    const { upcoming, previous } = splitBookings(
      [booking({ id: "a", preferredDate: "2030-01-15" }), booking({ id: "b", preferredDate: "2030-01-12" }), booking({ id: "c", status: "cancelled" }), booking({ id: "d", status: "completed" }), booking({ id: "e", preferredDate: "2030-01-01" })],
      now,
    );
    expect(upcoming.map((b) => b.id)).toEqual(["b", "a"]);
    expect(previous.map((b) => b.id).sort()).toEqual(["c", "d", "e"]);
  });
  it("filters by name and category", () => {
    const tests = [{ name: "CBC", category: "Blood", description: null }, { name: "Urine Routine", category: "Urine", description: "urinalysis" }];
    expect(filterLabTests(tests, "cbc", "All tests")).toHaveLength(1);
    expect(filterLabTests(tests, "", "Urine")).toHaveLength(1);
    expect(filterLabTests(tests, "zzz", "All tests")).toHaveLength(0);
  });
});
