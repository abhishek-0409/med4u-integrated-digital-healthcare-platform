import { z } from 'zod';
import { ConsultationMode } from '../../../database/entities/doctor.entity';

const TIME_RE = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;
const minuteOfDay = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

export const EducationEntrySchema = z.object({
  degree: z.string().min(1).max(100),
  institution: z.string().min(1).max(200),
  year: z.number().int().min(1950).max(new Date().getFullYear()),
});

const IntervalSchema = z.object({
  start: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Start must be a valid 24-hour HH:MM time.'),
  end: z.string().regex(TIME_RE, 'End must be a valid 24-hour HH:MM time or 24:00 (midnight at day end).'),
}).superRefine((interval, ctx) => {
  if (minuteOfDay(interval.start) >= minuteOfDay(interval.end)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['end'], message: 'End must be after start. Split overnight availability across two days.' });
  }
});

const DayScheduleSchema = z
  .object({
    start: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Start must be a valid 24-hour HH:MM').optional(),
    end: z.string().regex(TIME_RE, 'End must be a valid 24-hour HH:MM or 24:00.').optional(),
    slotDurationMinutes: z.number().int().min(10).max(120).default(30),
    breakStart: z.string().regex(TIME_RE, 'Time must be a valid 24-hour HH:MM').optional(),
    breakEnd: z.string().regex(TIME_RE, 'Time must be a valid 24-hour HH:MM').optional(),
    intervals: z.array(IntervalSchema).min(1).optional(),
  })
  .superRefine((schedule, ctx) => {
    const legacy = schedule.start !== undefined || schedule.end !== undefined;
    if (legacy !== (schedule.start !== undefined && schedule.end !== undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['end'], message: 'Provide both start and end.' });
    }
    if (schedule.start && schedule.end && minuteOfDay(schedule.start) >= minuteOfDay(schedule.end)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['end'], message: 'End must be after start. Split overnight availability across two days.' });
    }
    if (legacy === Boolean(schedule.intervals)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['intervals'], message: 'Provide either intervals or the legacy start/end range.' });
    }
    const intervals = schedule.intervals ?? (schedule.start && schedule.end ? [{ start: schedule.start, end: schedule.end }] : []);
    const sorted = [...intervals].sort((a, b) => minuteOfDay(a.start) - minuteOfDay(b.start));
    for (let index = 1; index < sorted.length; index += 1) {
      if (minuteOfDay(sorted[index].start) < minuteOfDay(sorted[index - 1].end)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['intervals'], message: 'Availability intervals cannot overlap.' });
        break;
      }
    }
    if (Boolean(schedule.breakStart) !== Boolean(schedule.breakEnd)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['breakEnd'],
        message: 'Provide both breakStart and breakEnd.',
      });
    }
    if (schedule.breakStart && schedule.breakEnd && schedule.start && schedule.end) {
      const breakStart = minuteOfDay(schedule.breakStart);
      const breakEnd = minuteOfDay(schedule.breakEnd);
      if (breakStart >= breakEnd || breakStart < minuteOfDay(schedule.start) || breakEnd > minuteOfDay(schedule.end)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['breakStart'],
          message: 'Break must be a valid interval inside the working hours.',
        });
      }
    }
  });

export const AvailabilityScheduleSchema = z
  .object({
    monday: DayScheduleSchema.optional(),
    tuesday: DayScheduleSchema.optional(),
    wednesday: DayScheduleSchema.optional(),
    thursday: DayScheduleSchema.optional(),
    friday: DayScheduleSchema.optional(),
    saturday: DayScheduleSchema.optional(),
    sunday: DayScheduleSchema.optional(),
  })
  .default({});

export const RegisterDoctorSchema = z
  .object({
    specialization: z.string().trim().min(2, 'At least 2 characters').max(100),
    licenseNumber: z.string().trim().min(5, 'At least 5 characters').max(50),
    experienceYears: z.number().int().min(0).max(60).default(0),
    bio: z.string().max(1000).optional(),
    consultationFee: z.number().min(0).default(0),
    languages: z
      .array(z.string().trim().min(1))
      .min(1, 'At least one language required')
      .default(['English']),
    education: z.array(EducationEntrySchema).default([]),
    availabilitySchedule: AvailabilityScheduleSchema,
    city: z.string().trim().max(100).optional(),
    consultationMode: z.nativeEnum(ConsultationMode).default(ConsultationMode.BOTH),
  })
  .strict();

export type RegisterDoctorDto = z.infer<typeof RegisterDoctorSchema>;
