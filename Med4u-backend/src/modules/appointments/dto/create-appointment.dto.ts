import { z } from 'zod';
import { AppointmentType } from '../../../database/entities/appointment.entity';

export const CreateAppointmentSchema = z
  .object({
    doctorId: z.string().uuid(),
    slotId: z.string().uuid(),
    /** Defaults to what the doctor offers (video when the doctor offers both). */
    type: z.nativeEnum(AppointmentType).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export type CreateAppointmentDto = z.infer<typeof CreateAppointmentSchema>;
