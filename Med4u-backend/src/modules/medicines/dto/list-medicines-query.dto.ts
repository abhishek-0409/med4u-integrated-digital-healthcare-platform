import { z } from 'zod';

const queryBool = z.enum(['true', 'false']).transform((v) => v === 'true');

export const ListMedicinesQuerySchema = z
  .object({
    /** Matches brand name, generic name, manufacturer or category. */
    search: z.string().trim().min(1).max(100).optional(),
    category: z.string().trim().min(1).max(100).optional(),
    requiresPrescription: queryBool.optional(),
    inStock: queryBool.optional(),
    sortBy: z.enum(['name', 'price_asc', 'price_desc']).default('name'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export type ListMedicinesQueryDto = z.infer<typeof ListMedicinesQuerySchema>;
