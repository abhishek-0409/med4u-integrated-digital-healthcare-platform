import { toApiSchedule, toEditableSchedule, validateSchedule, WEEKDAYS } from "./availabilityModel";

describe("doctor availability schedule model", () => {
  it("exposes all seven configurable days and saves only enabled days", () => {
    const schedule = toEditableSchedule();
    expect(WEEKDAYS).toHaveLength(7);
    for (const { key } of WEEKDAYS) schedule[key].enabled = true;
    expect(Object.keys(toApiSchedule(schedule))).toHaveLength(7);
    schedule.saturday.enabled = false;
    expect(toApiSchedule(schedule)).not.toHaveProperty("saturday");
  });

  it.each([
    ["00:00", "08:00"], ["09:00", "13:00"], ["13:00", "17:00"], ["22:00", "24:00"],
  ])("accepts %s–%s intervals including midnight", (start, end) => {
    const schedule = toEditableSchedule();
    schedule.monday = { enabled: true, intervals: [{ start, end }], slotDurationMinutes: 30 };
    expect(validateSchedule(schedule)).toBeNull();
  });

  it("restores saved multiple ranges and legacy ranges", () => {
    expect(toEditableSchedule({ monday: { start: "09:00", end: "12:00" } }).monday.intervals)
      .toEqual([{ start: "09:00", end: "12:00" }]);
    expect(toEditableSchedule({ monday: { start: "09:00", end: "17:00", breakStart: "12:00", breakEnd: "13:00" } }).monday.intervals)
      .toEqual([{ start: "09:00", end: "12:00" }, { start: "13:00", end: "17:00" }]);
    expect(toEditableSchedule({ tuesday: { intervals: [{ start: "09:00", end: "12:00" }, { start: "13:00", end: "17:00" }] } }).tuesday.intervals)
      .toHaveLength(2);
  });

  it("rejects zero-length, overnight, invalid and overlapping intervals", () => {
    const schedule = toEditableSchedule();
    schedule.monday = { enabled: true, intervals: [{ start: "09:00", end: "09:00" }], slotDurationMinutes: 30 };
    expect(validateSchedule(schedule)).toMatch(/after start/);
    schedule.monday.intervals = [{ start: "22:00", end: "02:00" }];
    expect(validateSchedule(schedule)).toMatch(/Split overnight/);
    schedule.monday.intervals = [{ start: "09:00", end: "12:00" }, { start: "11:00", end: "13:00" }];
    expect(validateSchedule(schedule)).toMatch(/overlap/);
  });
});
