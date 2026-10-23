import { ApiDaySchedule, ApiWeekday } from "../types/appointment";

export const WEEKDAYS: Array<{ key: ApiWeekday; label: string }> = [
  { key: "monday", label: "Monday" }, { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" }, { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" }, { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

export interface ScheduleInterval { start: string; end: string }
export interface EditableDay { enabled: boolean; intervals: ScheduleInterval[]; slotDurationMinutes: number }
export type EditableSchedule = Record<ApiWeekday, EditableDay>;

const minutes = (value: string) => {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
};
const freshDay = (): EditableDay => ({ enabled: false, intervals: [{ start: "09:00", end: "17:00" }], slotDurationMinutes: 30 });

export function toEditableSchedule(schedule: Partial<Record<ApiWeekday, ApiDaySchedule>> = {}): EditableSchedule {
  return Object.fromEntries(WEEKDAYS.map(({ key }) => {
    const day = schedule[key];
    let intervals = day?.intervals ?? (day?.start && day?.end ? [{ start: day.start, end: day.end }] : []);
    if (!day?.intervals?.length && day?.breakStart && day?.breakEnd && day.start && day.end) {
      intervals = [
        ...(day.start < day.breakStart ? [{ start: day.start, end: day.breakStart }] : []),
        ...(day.breakEnd < day.end ? [{ start: day.breakEnd, end: day.end }] : []),
      ];
    }
    return [key, day && intervals.length
      ? { enabled: true, intervals: intervals.map((item) => ({ ...item })), slotDurationMinutes: day.slotDurationMinutes ?? 30 }
      : freshDay()];
  })) as EditableSchedule;
}

export function validateSchedule(schedule: EditableSchedule): string | null {
  for (const { key, label } of WEEKDAYS) {
    const day = schedule[key];
    if (!day.enabled) continue;
    if (!day.intervals.length) return `${label}: add at least one interval or turn the day off.`;
    const ranges = [...day.intervals].sort((a, b) => minutes(a.start) - minutes(b.start));
    for (const range of ranges) {
      if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(range.start)) return `${label}: choose a valid start time.`;
      if (!/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/.test(range.end)) return `${label}: choose a valid end time.`;
      if (minutes(range.start) >= minutes(range.end)) return `${label}: end must be after start. Split overnight hours across two days.`;
    }
    for (let index = 1; index < ranges.length; index += 1) {
      if (minutes(ranges[index].start) < minutes(ranges[index - 1].end)) return `${label}: intervals cannot overlap.`;
    }
  }
  return null;
}

export function toApiSchedule(schedule: EditableSchedule): Partial<Record<ApiWeekday, ApiDaySchedule>> {
  return Object.fromEntries(WEEKDAYS.filter(({ key }) => schedule[key].enabled).map(({ key }) => [key, {
    intervals: schedule[key].intervals.map((item) => ({ ...item })),
    slotDurationMinutes: schedule[key].slotDurationMinutes,
  }])) as Partial<Record<ApiWeekday, ApiDaySchedule>>;
}

export function formatTime(value: string, end = false): string {
  if (value === "24:00") return "12:00 AM · end of day";
  const [hour, minute] = value.split(":").map(Number);
  const suffix = hour < 12 ? "AM" : "PM";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}${end && hour === 0 && minute === 0 ? " · next day" : ""}`;
}
