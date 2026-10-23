import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TimeSlot } from '../../database/entities/time-slot.entity';
import { DaySchedule, Doctor } from '../../database/entities/doctor.entity';
import {
  isWithinBookingWindow,
  toHhMm,
  todayInClinic,
} from '../appointments/appointment-time.util';
import { TimeSlotResponse } from './doctor.types';

const DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const fromMinutes = (total: number): string =>
  `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

/** Expands a day schedule into consecutive slots, skipping any that overlap the break. */
export function buildDaySlots(schedule: DaySchedule): Array<{ startTime: string; endTime: string }> {
  const step = schedule.slotDurationMinutes || 30;
  const intervals = schedule.intervals ?? (schedule.start && schedule.end
    ? [{ start: schedule.start, end: schedule.end }]
    : []);
  const breakStart = schedule.breakStart ? toMinutes(schedule.breakStart) : null;
  const breakEnd = schedule.breakEnd ? toMinutes(schedule.breakEnd) : null;
  const slots: Array<{ startTime: string; endTime: string }> = [];

  for (const interval of intervals) {
    const startMinute = toMinutes(interval.start);
    const endMinute = interval.end === '24:00' ? 1440 : toMinutes(interval.end);
    for (let start = startMinute; start + step <= endMinute; start += step) {
      const overlapsBreak =
        breakStart !== null && breakEnd !== null && start < breakEnd && start + step > breakStart;
      if (!overlapsBreak) {
        slots.push({ startTime: fromMinutes(start), endTime: fromMinutes(start + step) });
      }
    }
  }
  return slots;
}

/** True only when the exact slot is part of the doctor's current schedule for that date. */
export function isSlotInDoctorSchedule(
  doctor: Doctor,
  date: string,
  startTime: string,
  endTime: string,
): boolean {
  const isMinuteBoundary = (time: string, allowDayEnd = false): boolean =>
    (allowDayEnd && /^(?:24:00)(?::00(?:\.0+)?)?$/.test(time)) ||
    /^(?:[01]\d|2[0-3]):[0-5]\d(?::00(?:\.0+)?)?$/.test(time);
  if (!isMinuteBoundary(startTime) || !isMinuteBoundary(endTime, true)) return false;

  const dayName = DAY_NAMES[new Date(`${date}T00:00:00Z`).getUTCDay()];
  const schedule = doctor.availabilitySchedule?.[dayName];
  if (!schedule) return false;
  const start = toHhMm(startTime);
  const end = toHhMm(endTime);
  return buildDaySlots(schedule).some((slot) => slot.startTime === start && slot.endTime === end);
}

@Injectable()
export class TimeSlotRepository {
  constructor(
    @InjectRepository(TimeSlot) private readonly slots: Repository<TimeSlot>,
  ) {}

  /**
   * Materialises the doctor's weekly schedule as time_slots rows for one date (today up to the
   * booking horizon). Idempotent and race-safe: the unique (doctor, date, start) index makes
   * concurrent inserts no-ops.
   */
  async ensureSlotsForDate(doctor: Doctor, date: string): Promise<void> {
    const today = todayInClinic();
    if (!isWithinBookingWindow(date, today)) {
      return;
    }
    const dayName = DAY_NAMES[new Date(`${date}T00:00:00Z`).getUTCDay()];
    const schedule = doctor.availabilitySchedule?.[dayName];
    if (!schedule) {
      return;
    }
    const rows = buildDaySlots(schedule);
    if (rows.length === 0) {
      return;
    }
    await this.slots
      .createQueryBuilder()
      .insert()
      .into(TimeSlot)
      .values(rows.map((r) => ({ doctorId: doctor.id, date, ...r, isBooked: false })))
      .orIgnore()
      .execute();
  }

  findByDoctorAndDate(doctorId: string, date: string): Promise<TimeSlot[]> {
    return this.slots
      .createQueryBuilder('slot')
      .where('slot.doctorId = :doctorId', { doctorId })
      .andWhere('slot.date = :date', { date })
      .andWhere('slot.deletedAt IS NULL')
      .orderBy('slot.startTime', 'ASC')
      .getMany();
  }

  async findOccupiedIntervals(
    doctorId: string,
    date: string,
  ): Promise<Array<{ startTime: string; endTime: string }>> {
    return this.slots
      .createQueryBuilder('slot')
      .innerJoin('slot.appointments', 'appointment')
      .select('slot.startTime', 'startTime')
      .addSelect('slot.endTime', 'endTime')
      .where('slot.doctorId = :doctorId', { doctorId })
      .andWhere('slot.date = :date', { date })
      .andWhere('slot.deletedAt IS NULL')
      .andWhere('appointment.status IN (:...live)', { live: ['pending', 'confirmed'] })
      .getRawMany();
  }

  toResponse(slot: TimeSlot, isAvailable: boolean): TimeSlotResponse {

    return {
      id: slot.id,
      date: slot.date,
      startTime: toHhMm(slot.startTime),
      endTime: toHhMm(slot.endTime),
      isBooked: slot.isBooked,
      isAvailable,
    };
  }
}
