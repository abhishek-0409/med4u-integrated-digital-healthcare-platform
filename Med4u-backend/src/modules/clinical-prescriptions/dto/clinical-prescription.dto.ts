import { z } from 'zod';
import {
  DOSAGE_FORMS,
  FOOD_RELATIONS,
  MEDICINE_ROUTES,
  TIMINGS,
} from '../../../database/entities/clinical-prescription.entity';

export const MAX_MEDICINES = 20;
export const MAX_RECOMMENDED_TESTS = 20;

const text = (max: number) => z.string().trim().min(1).max(max);
/** Treats an empty string as "not provided" so form fields can be cleared. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const PrescribedMedicineSchema = z
  .object({
    /** `variants.id` from the medicine catalog. Name and generic name are then taken from the catalog, not the client. */
    catalogMedicineId: z.string().uuid().optional().nullable(),
    name: text(200),
    strength: text(60),
    dosageForm: z.enum(DOSAGE_FORMS),
    dose: text(60),
    route: z.enum(MEDICINE_ROUTES),
    frequency: text(80),
    durationValue: z.number().int().min(1).max(365),
    durationUnit: z.enum(['days', 'weeks', 'months']),
    quantity: z.number().int().min(1).max(9999),
    quantityUnit: optionalText(30),
    timing: z.array(z.enum(TIMINGS)).max(4).default([]),
    foodRelation: z.enum(FOOD_RELATIONS).default('not_applicable'),
    instructions: optionalText(500),
  })
  .strict();
export type PrescribedMedicineInput = z.infer<typeof PrescribedMedicineSchema>;

export const PrescribedTestSchema = z.object({
  labTestId: z.string().uuid(),
  clinicalInstructions: optionalText(500),
}).strict();
export type PrescribedTestInput = z.infer<typeof PrescribedTestSchema>;

export const SearchPrescriptionLabTestsSchema = z.object({
  search: z.string().trim().min(1).max(100),
}).strict();
export type SearchPrescriptionLabTestsDto = z.infer<typeof SearchPrescriptionLabTestsSchema>;

const followUpDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) &&
      new Date(`${v}T00:00:00Z`).toISOString().startsWith(v),
    'Not a real date',
  )
  .optional()
  .nullable()
  .transform((v) => v ?? null);

/**
 * Body for saving a draft. Identity (doctor, patient) is never accepted from the client; strict mode makes any
 * attempt to send `patientId`, `doctorId`, `status`, etc. a validation error rather than silently ignoring it.
 */
export const SaveDraftSchema = z
  .object({
    /** Optimistic concurrency for autosaves. Omitted by older clients. */
    baseRevision: z.number().int().min(1).optional().nullable(),
    diagnosis: optionalText(1000),
    medicines: z.array(PrescribedMedicineSchema).max(MAX_MEDICINES).default([]),
    recommendedTests: z.array(PrescribedTestSchema).max(MAX_RECOMMENDED_TESTS).default([]),
    additionalInstructions: optionalText(1500),
    warnings: optionalText(1000),
    followUpDate,
  })
  .strict();
export type SaveDraftDto = z.infer<typeof SaveDraftSchema>;

/** `revision` binds the issue request to the exact draft the doctor reviewed. */
export const IssuePrescriptionSchema = z.object({ revision: z.number().int().min(1) }).strict();
export type IssuePrescriptionDto = z.infer<typeof IssuePrescriptionSchema>;

export const AmendPrescriptionSchema = z
  .object({ reason: z.string().trim().min(5).max(300) })
  .strict();
export type AmendPrescriptionDto = z.infer<typeof AmendPrescriptionSchema>;

export const CancelPrescriptionSchema = z
  .object({ reason: z.string().trim().min(5).max(300) })
  .strict();
export type CancelPrescriptionDto = z.infer<typeof CancelPrescriptionSchema>;

export const ListMyClinicalPrescriptionsQuerySchema = z
  .object({
    appointmentId: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export type ListMyClinicalPrescriptionsQueryDto = z.infer<
  typeof ListMyClinicalPrescriptionsQuerySchema
>;

export const RegisterPushTokenSchema = z.object({
  token: z.string().regex(/^ExponentPushToken\[[A-Za-z0-9_-]+\]$/).max(255),
  deviceId: z.string().trim().min(1).max(100),
}).strict();
export type RegisterPushTokenDto = z.infer<typeof RegisterPushTokenSchema>;
