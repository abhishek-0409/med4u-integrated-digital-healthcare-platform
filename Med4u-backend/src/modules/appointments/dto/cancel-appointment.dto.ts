import { z } from 'zod';

export const CancelAppointmentSchema = z
  .object({
    reason: z.string().trim().min(1).max(300).optional(),
  })
  .strict();

export type CancelAppointmentDto = z.infer<typeof CancelAppointmentSchema>;
