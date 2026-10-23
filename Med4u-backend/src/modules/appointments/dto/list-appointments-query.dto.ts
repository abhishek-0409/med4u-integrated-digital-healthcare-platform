import { z } from 'zod';
import { AppointmentStatus } from '../../../database/entities/appointment.entity';

export const ListAppointmentsQuerySchema = z
  .object({
    /** upcoming = live appointments that haven't ended; past = everything else. */
    scope: z.enum(['upcoming', 'past']).optional(),
    status: z.nativeEnum(AppointmentStatus).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict();

export type ListAppointmentsQueryDto = z.infer<typeof ListAppointmentsQuerySchema>;
