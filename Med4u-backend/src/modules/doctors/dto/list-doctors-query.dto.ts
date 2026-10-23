import { z } from 'zod';
import { ConsultationMode } from '../../../database/entities/doctor.entity';

export const ListDoctorsQuerySchema = z
  .object({
    /** Case-insensitive exact match; use `search` for fuzzy matching. */
    specialization: z.string().trim().min(1).optional(),
    /** Matches doctor name, specialization or city. */
    search: z.string().trim().min(1).max(100).optional(),
    city: z.string().trim().min(1).optional(),
    minRating: z.coerce.number().min(0).max(5).optional(),
    maxFee: z.coerce.number().min(0).optional(),
    consultationMode: z.nativeEnum(ConsultationMode).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    sortBy: z.enum(['rating', 'experience', 'fee']).default('rating'),
  })
  .strict();

export type ListDoctorsQueryDto = z.infer<typeof ListDoctorsQuerySchema>;
