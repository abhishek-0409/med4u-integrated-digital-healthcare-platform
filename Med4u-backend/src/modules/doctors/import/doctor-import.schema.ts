import { createHash } from 'crypto';
import { z } from 'zod';
import { ConsultationMode } from '../../../database/entities/doctor.entity';
import { Gender } from '../../../database/entities/user.entity';

/**
 * Import record for REAL doctors. Every field is optional except identity and provenance:
 * anything the source does not supply stays null ("Not provided"); nothing is guessed.
 *
 * Provenance is mandatory. A record without a named source, a retrieval date and a statement of the
 * permission under which the data may be used is rejected, so nothing scraped or copied without
 * permission can enter the directory by accident.
 *
 * Verification is deliberately NOT part of an import record (the schema is strict): imported doctors
 * start unverified and only `doctors:verify` can change that.
 */

const thisYear = () => new Date().getUTCFullYear();
const year = (min = 1940) =>
  z
    .number()
    .int()
    .min(min)
    .refine((y) => y <= thisYear(), 'Year cannot be in the future');

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && d.getTime() <= Date.now();
  }, 'Not a real, non-future date');

const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((u) => u.startsWith('https://'), 'Must be an https URL');

export const DoctorImportRecordSchema = z
  .object({
    fullName: trimmed(2, 100),
    gender: z.nativeEnum(Gender).optional(),
    specialization: trimmed(2, 100),

    registrationCouncil: trimmed(3, 120),
    registrationNumber: trimmed(1, 50).regex(/^[A-Za-z0-9/\-. ]+$/, 'Unexpected characters in registration number'),
    registrationYear: year(1950).optional(),

    qualifications: z
      .array(
        z
          .object({
            degree: trimmed(2, 100),
            institution: trimmed(2, 150).optional(),
            year: year(1950).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(10),

    /** Preferred: experience is then computed and never goes stale. */
    careerStartYear: year(1950).optional(),
    /** Alternative: a stated value, which must say where it came from. */
    statedExperienceYears: z.number().int().min(0).max(70).optional(),
    experienceSource: trimmed(3, 200).optional(),

    clinicName: trimmed(2, 150).optional(),
    city: trimmed(2, 100).optional(),
    address: trimmed(5, 500).optional(),
    consultationMode: z.nativeEnum(ConsultationMode).optional(),
    consultationFeeInr: z.number().positive().max(100000).optional(),
    languages: z.array(trimmed(2, 40)).max(10).optional(),
    bio: trimmed(10, 1000).optional(),

    photoUrl: httpsUrl.optional(),
    photoAttribution: trimmed(3, 200).optional(),

    source: z
      .object({
        name: trimmed(3, 120),
        url: httpsUrl.optional(),
        retrievedAt: isoDate,
        /** e.g. "Supplied by the doctor via signed onboarding form #123" or "Licensed under <agreement>". */
        permission: trimmed(10, 300),
      })
      .strict(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.statedExperienceYears !== undefined && !r.experienceSource && !r.careerStartYear) {
      ctx.addIssue({ code: 'custom', path: ['experienceSource'], message: 'A stated experience value needs its source' });
    }
    if (r.photoUrl && !r.photoAttribution) {
      ctx.addIssue({ code: 'custom', path: ['photoAttribution'], message: 'A photo needs attribution/permission credit' });
    }
    if (r.careerStartYear && r.registrationYear && r.careerStartYear < r.registrationYear - 60) {
      ctx.addIssue({ code: 'custom', path: ['careerStartYear'], message: 'Implausible career start year' });
    }
  });

export const DoctorImportFileSchema = z.array(DoctorImportRecordSchema).min(1).max(5000);

export type DoctorImportRecord = z.infer<typeof DoctorImportRecordSchema>;

// ── Identity normalisation (the duplicate-prevention keys) ────────────────────

/** "  Maharashtra   Medical Council " -> "Maharashtra Medical Council" (display form). */
export const cleanCouncil = (council: string): string => council.trim().replace(/\s+/g, ' ');

/** Comparison key: case- and spacing-insensitive. */
export const councilKey = (council: string): string => cleanCouncil(council).toLowerCase();

/** "mh 2010/03 1234" -> "MH2010/031234": spaces removed, upper-cased. */
export const cleanRegistrationNumber = (n: string): string => n.replace(/\s+/g, '').toUpperCase();

/** Stable digest of the registration identity, used for the placeholder login-less identity. */
export const registrationDigest = (council: string, number: string): string =>
  createHash('sha256').update(`${councilKey(council)}|${cleanRegistrationNumber(number)}`).digest('hex');

/** Fits `doctors.license_number` (varchar 50, unique). */
export const licenseKey = (council: string, number: string): string =>
  `REG-${registrationDigest(council, number).slice(0, 32)}`;

/** Fits `users.phone` (varchar 20, unique). Not a phone number, so OTP login can never reach it. */
export const placeholderPhone = (council: string, number: string): string =>
  `imp-${registrationDigest(council, number).slice(0, 16)}`;

/** "Dr. A. Kumar" / "DR A KUMAR" -> "a kumar": for comparing names against the register. */
export const normalizeName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/\b(dr|prof|mr|mrs|ms)\b\.?/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
