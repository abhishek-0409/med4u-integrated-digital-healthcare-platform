import { buildDaySlots, isSlotInDoctorSchedule } from './time-slot.repository';

describe('buildDaySlots', () => {
  it('creates consecutive non-overlapping intervals and skips break intervals', () => {
    const slots = buildDaySlots({
      start: '09:00',
      end: '12:00',
      slotDurationMinutes: 30,
      breakStart: '10:15',
      breakEnd: '10:45',
    });

    expect(slots).toEqual([
      { startTime: '09:00', endTime: '09:30' },
      { startTime: '09:30', endTime: '10:00' },
      { startTime: '11:00', endTime: '11:30' },
      { startTime: '11:30', endTime: '12:00' },
    ]);
    expect(slots.every((slot, i) => i === 0 || slots[i - 1].endTime <= slot.startTime)).toBe(true);
  });

  it('does not emit duplicate slots when a schedule ends mid-slot', () => {
    expect(buildDaySlots({ start: '09:00', end: '10:20', slotDurationMinutes: 30 })).toEqual([
      { startTime: '09:00', endTime: '09:30' },
      { startTime: '09:30', endTime: '10:00' },
    ]);
  });

  it('generates consecutive slots from multiple intervals, including midnight endpoints', () => {
    expect(buildDaySlots({
      intervals: [{ start: '00:00', end: '01:00' }, { start: '23:00', end: '24:00' }],
      slotDurationMinutes: 30,
    })).toEqual([
      { startTime: '00:00', endTime: '00:30' }, { startTime: '00:30', endTime: '01:00' },
      { startTime: '23:00', endTime: '23:30' }, { startTime: '23:30', endTime: '24:00' },
    ]);
  });

  it('recognizes only exact slots in the current weekday schedule', () => {
    const doctor = {
      availabilitySchedule: {
        monday: { start: '09:00', end: '10:00', slotDurationMinutes: 30 },
      },
    } as Parameters<typeof isSlotInDoctorSchedule>[0];

    expect(isSlotInDoctorSchedule(doctor, '2026-10-19', '09:00:00', '09:30:00')).toBe(true);
    expect(isSlotInDoctorSchedule(doctor, '2026-10-19', '09:00:01', '09:30:00')).toBe(false);
    expect(isSlotInDoctorSchedule(doctor, '2026-10-20', '09:00:00', '09:30:00')).toBe(false);
  });

  it('recognizes a slot ending at midnight as the end of the same clinic day', () => {
    const doctor = { availabilitySchedule: { monday: { intervals: [{ start: '23:00', end: '24:00' }], slotDurationMinutes: 30 } } } as Parameters<typeof isSlotInDoctorSchedule>[0];
    expect(isSlotInDoctorSchedule(doctor, '2026-10-19', '23:30:00', '24:00:00')).toBe(true);
  });
});
