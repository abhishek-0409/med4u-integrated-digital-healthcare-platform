import { z } from 'zod';

const SurgerySchema = z.object({
  name: z.string().trim().min(1).max(100),
  year: z
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear(), `Year cannot be in the future`),
  notes: z.string().max(500).optional(),
});

const MedicationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  dosage: z.string().trim().min(1).max(50),
  frequency: z.string().trim().min(1).max(100),
  since: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .optional(),
});

const FamilyHistorySchema = z.object({
  condition: z.string().trim().min(1).max(100),
  relation: z.enum(['father', 'mother', 'sibling', 'grandparent', 'other']),
});

export const MedicalHistorySchema = z
  .object({
    allergies: z
      .array(z.string().trim().min(1).max(100))
      .max(50, 'Maximum 50 allergy entries')
      .optional(),

    chronicConditions: z
      .array(z.string().trim().min(1).max(100))
      .max(50, 'Maximum 50 condition entries')
      .optional(),

    pastSurgeries: z
      .array(SurgerySchema)
      .max(20, 'Maximum 20 surgery records')
      .optional(),

    currentMedications: z
      .array(MedicationSchema)
      .max(50, 'Maximum 50 medication entries')
      .optional(),

    familyHistory: z
      .array(FamilyHistorySchema)
      .max(50, 'Maximum 50 family history entries')
      .optional(),

    notes: z.string().max(2000).nullable().optional(),
  })
  .strict();

export type MedicalHistoryDto = z.infer<typeof MedicalHistorySchema>;
