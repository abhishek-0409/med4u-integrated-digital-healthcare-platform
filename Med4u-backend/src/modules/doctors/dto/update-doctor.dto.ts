import { z } from 'zod';
import { ConsultationMode } from '../../../database/entities/doctor.entity';
import { EducationEntrySchema, AvailabilityScheduleSchema } from './register-doctor.dto';

export const UpdateDoctorSchema = z
  .object({
    specialization: z.string().trim().min(2).max(100).optional(),
    bio: z.string().max(1000).nullable().optional(),
    consultationFee: z.number().min(0).optional(),
    languages: z.array(z.string().trim().min(1)).min(1).optional(),
    education: z.array(EducationEntrySchema).optional(),
    availabilitySchedule: AvailabilityScheduleSchema.optional(),
    city: z.string().trim().max(100).nullable().optional(),
    consultationMode: z.nativeEnum(ConsultationMode).optional(),
    isAvailableToday: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateDoctorDto = z.infer<typeof UpdateDoctorSchema>;
