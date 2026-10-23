import { z } from 'zod';
import { ConsultationMode } from '../../../database/entities/doctor.entity';
import { RegistryCheck } from '../../../database/entities/doctor-application.entity';

const text = (label: string, min: number, max: number, pattern?: [RegExp, string]) => {
  let schema = z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);
  if (pattern) schema = schema.regex(pattern[0], pattern[1]);
  // Control characters have no place in any of these fields.
  // eslint-disable-next-line no-control-regex
  return schema.refine((v) => !/[\u0000-\u001f\u007f]/.test(v), `${label} contains invalid characters`);
};

/** Letters, digits and the separators real registration numbers use (e.g. "MH/2015/12345", "A-12345"). */
const REGISTRATION_NUMBER = /^[A-Za-z0-9][A-Za-z0-9 /._-]{2,49}$/;

export const ApplicationFieldsSchema = z
  .object({
    fullName: text('Full name', 3, 100),
    email: z
      .string({ required_error: 'Email is required' })
      .trim()
      .toLowerCase()
      .email('Enter a valid email address')
      .max(150),
    registrationNumber: text('Medical registration number', 3, 50, [
      REGISTRATION_NUMBER,
      'Registration number may contain letters, digits and / . _ - only',
    ]),
    registrationCouncil: text('Registration council', 3, 120),
    qualification: text('Medical qualification', 2, 100),
    medicalCollege: text('Medical college', 3, 150),
    specialization: text('Specialization', 2, 100),
    clinicName: text('Clinic or hospital name', 2, 150),
    clinicAddress: text('Clinic or hospital address', 5, 300),
    city: text('City', 2, 100),
    consultationMode: z.nativeEnum(ConsultationMode, {
      errorMap: () => ({ message: 'Choose ONLINE, OFFLINE or BOTH' }),
    }),
  })
  .strict();
export type ApplicationFieldsDto = z.infer<typeof ApplicationFieldsSchema>;

/** Resubmission: any subset of the fields may be corrected. At least one field or file must change. */
export const ResubmitFieldsSchema = ApplicationFieldsSchema.partial();
export type ResubmitFieldsDto = z.infer<typeof ResubmitFieldsSchema>;

export const ListApplicationsQuerySchema = z.object({
  status: z
    .enum(['PENDING_VERIFICATION', 'UNDER_REVIEW', 'NEEDS_INFO', 'APPROVED', 'REJECTED'])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListApplicationsQueryDto = z.infer<typeof ListApplicationsQuerySchema>;

const notes = z.string().trim().min(10, 'Add at least 10 characters').max(2000);

export const ApproveApplicationSchema = z
  .object({
    registryCheck: z.nativeEnum(RegistryCheck),
    /** Which official register was consulted (required when one was). */
    registrySource: z.string().trim().min(3).max(200).optional(),
    /** The reviewer's reference for that lookup, e.g. the register entry id or date checked. */
    registryReference: z.string().trim().min(1).max(200).optional(),
    /** Required when no register could be consulted. */
    registryUnavailableReason: z.string().trim().min(10).max(500).optional(),
    notes,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.registryCheck === RegistryCheck.VERIFIED_AGAINST_OFFICIAL_REGISTER) {
      if (!v.registrySource) {
        ctx.addIssue({ code: 'custom', path: ['registrySource'], message: 'Name the official register you consulted' });
      }
      if (!v.registryReference) {
        ctx.addIssue({ code: 'custom', path: ['registryReference'], message: 'Record your lookup reference' });
      }
    } else if (!v.registryUnavailableReason) {
      ctx.addIssue({
        code: 'custom',
        path: ['registryUnavailableReason'],
        message: 'Explain why no official register could be checked',
      });
    }
  });
export type ApproveApplicationDto = z.infer<typeof ApproveApplicationSchema>;

export const RejectApplicationSchema = z
  .object({
    /** Shown to the applicant. */
    reason: z.string().trim().min(10, 'Give the applicant a reason').max(1000),
    allowResubmission: z.boolean().default(false),
    notes: notes.optional(),
  })
  .strict();
export type RejectApplicationDto = z.infer<typeof RejectApplicationSchema>;

export const RequestInfoSchema = z
  .object({
    /** Shown to the applicant: what is missing or needs correcting. */
    message: z.string().trim().min(10, 'Tell the applicant what is needed').max(1000),
    notes: notes.optional(),
  })
  .strict();
export type RequestInfoDto = z.infer<typeof RequestInfoSchema>;
