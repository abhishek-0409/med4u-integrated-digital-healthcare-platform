import { AvailabilityScheduleSchema } from './register-doctor.dto';

describe('AvailabilityScheduleSchema', () => {
  it('accepts a valid weekday schedule and break', () => {
    expect(
      AvailabilityScheduleSchema.safeParse({
        monday: {
          start: '09:00',
          end: '17:00',
          slotDurationMinutes: 30,
          breakStart: '12:00',
          breakEnd: '13:00',
        },
      }).success,
    ).toBe(true);
  });

  it.each([
    { start: '9:00', end: '17:00', slotDurationMinutes: 30 },
    { start: '17:00', end: '09:00', slotDurationMinutes: 30 },
    { start: '09:00', end: '17:00', slotDurationMinutes: 30, breakStart: '12:00' },
    {
      start: '09:00',
      end: '17:00',
      slotDurationMinutes: 30,
      breakStart: '18:00',
      breakEnd: '19:00',
    },
  ])('rejects invalid schedule %j', (day) => {
    expect(AvailabilityScheduleSchema.safeParse({ monday: day }).success).toBe(false);
  });

  it('accepts seven-day schedules, multiple ranges, midnight starts and end-of-day midnight', () => {
    const schedule = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => [day, {
      intervals: [{ start: '00:00', end: '08:00' }, { start: '09:00', end: '12:00' }, { start: '13:00', end: '24:00' }],
      slotDurationMinutes: 30,
    }]));
    expect(AvailabilityScheduleSchema.safeParse(schedule).success).toBe(true);
  });

  it('rejects overlapping, zero-length, and overnight intervals', () => {
    for (const intervals of [
      [{ start: '09:00', end: '12:00' }, { start: '11:30', end: '13:00' }],
      [{ start: '09:00', end: '09:00' }],
      [{ start: '22:00', end: '02:00' }],
    ]) expect(AvailabilityScheduleSchema.safeParse({ monday: { intervals } }).success).toBe(false);
  });
});
