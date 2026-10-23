import {
  addDays,
  isWithinBookingWindow,
  MAX_ADVANCE_DAYS,
} from './appointment-time.util';

describe('appointment booking window', () => {
  const clinicToday = '2026-10-16';

  it('allows the requested November 17 and 18, 2026 clinic dates', () => {
    expect(isWithinBookingWindow('2026-11-17', clinicToday)).toBe(true);
    expect(isWithinBookingWindow('2026-11-18', clinicToday)).toBe(true);
  });

  it('includes today and the maximum advance date, but rejects dates outside the window', () => {
    const lastBookableDate = addDays(clinicToday, MAX_ADVANCE_DAYS);

    expect(isWithinBookingWindow(clinicToday, clinicToday)).toBe(true);
    expect(isWithinBookingWindow(lastBookableDate, clinicToday)).toBe(true);
    expect(isWithinBookingWindow(addDays(lastBookableDate, 1), clinicToday)).toBe(false);
    expect(isWithinBookingWindow(addDays(clinicToday, -1), clinicToday)).toBe(false);
  });
});
