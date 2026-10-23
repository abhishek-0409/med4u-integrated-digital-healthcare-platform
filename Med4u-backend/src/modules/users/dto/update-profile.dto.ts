import { z } from 'zod';
import { Gender, BloodGroup } from '../../../database/entities/user.entity';

const MAX_AGE_YEARS = 120;

/** A real calendar date in YYYY-MM-DD that is not in the future and not implausibly old. */
const isPlausibleBirthDate = (value: string): boolean => {
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return false;
  const now = new Date();
  if (d.getTime() > now.getTime()) return false;
  const oldest = new Date(now);
  oldest.setUTCFullYear(oldest.getUTCFullYear() - MAX_AGE_YEARS);
  return d.getTime() >= oldest.getTime();
};

export const UpdateProfileSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name must be at most 100 characters')
      .optional(),

    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(150, 'Email must be at most 150 characters')
      .email('Invalid email address')
      .nullable()
      .optional(),

    dob: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
      .refine(isPlausibleBirthDate, 'Enter a valid date of birth in the past')
      .nullable()
      .optional(),

    gender: z.nativeEnum(Gender).nullable().optional(),

    bloodGroup: z.nativeEnum(BloodGroup).nullable().optional(),

    /** Centimetres, one decimal place at most. */
    heightCm: z
      .number()
      .min(50, 'Height must be between 50 and 250 cm')
      .max(250, 'Height must be between 50 and 250 cm')
      .multipleOf(0.1)
      .nullable()
      .optional(),

    /** Kilograms, one decimal place at most. */
    weightKg: z
      .number()
      .min(2, 'Weight must be between 2 and 500 kg')
      .max(500, 'Weight must be between 2 and 500 kg')
      .multipleOf(0.1)
      .nullable()
      .optional(),

    avatarUrl: z.string().url('Invalid URL').nullable().optional(),
  })
  .strict();

export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;
