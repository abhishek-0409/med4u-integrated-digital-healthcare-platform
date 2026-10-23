import { EntityManager } from 'typeorm';
import { ConsultationMode, Doctor } from '../../../database/entities/doctor.entity';
import { User, UserRole } from '../../../database/entities/user.entity';
import {
  DoctorImportRecord,
  cleanCouncil,
  cleanRegistrationNumber,
  councilKey,
  licenseKey,
  normalizeName,
  placeholderPhone,
} from './doctor-import.schema';

export type ImportAction = 'create' | 'update' | 'unchanged' | 'error';

export interface ImportOutcome {
  /** "<council> / <number>" for log lines. */
  registration: string;
  action: ImportAction;
  /** Fields that changed (update) or a reason (error). */
  details: string[];
  warnings: string[];
}

export class DryRunRollback extends Error {
  constructor(readonly outcomes: ImportOutcome[]) {
    super('dry run');
  }
}

/** Value equality that tolerates PostgreSQL returning numeric columns as strings ("500.00" vs 500). */
const same = (a: unknown, b: unknown): boolean => {
  if (typeof a === 'string' && typeof b === 'number') return Number(a) === b;
  if (typeof a === 'number' && typeof b === 'string') return a === Number(b);
  return canonical(a) === canonical(b);
};

/** Exported for sibling modules that need the same notion of "unchanged". */
export const valuesEqual = (a: unknown, b: unknown): boolean => same(a, b);

/** JSON with sorted object keys: PostgreSQL jsonb does not preserve key order. */
const canonical = (value: unknown): string =>
  JSON.stringify(value ?? null, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([x], [y]) => x.localeCompare(y)))
      : v,
  );

/** The doctor row for a registration identity, by the unique registration columns or the derived key. */
async function findByRegistration(em: EntityManager, council: string, number: string): Promise<Doctor | null> {
  return em
    .getRepository(Doctor)
    .createQueryBuilder('d')
    .innerJoinAndSelect('d.user', 'u')
    .where(
      `(lower(d.registrationCouncil) = :c AND upper(d.registrationNumber) = :n) OR d.licenseNumber = :k`,
      { c: councilKey(council), n: cleanRegistrationNumber(number), k: licenseKey(council, number) },
    )
    .getOne();
}

/**
 * Imports sourced doctor records. Idempotent: the registration identity is the key, so re-running a
 * file updates in place and a second run of the same file reports "unchanged".
 *
 * Guarantees:
 *  - never reads, modifies or deletes demo doctors (a collision is an error, not an overwrite);
 *  - never sets is_verified or any verification column on a doctor;
 *  - only overwrites fields that the record actually supplies;
 *  - existing doctor ids, user ids and appointment relations are preserved;
 *  - creates login-less placeholder users (no phone OTP can match them).
 * Must be called inside a transaction (the CLI wraps it).
 */
export async function importDoctors(em: EntityManager, records: DoctorImportRecord[]): Promise<ImportOutcome[]> {
  const outcomes: ImportOutcome[] = [];
  const seen = new Set<string>();

  for (const r of records) {
    const council = cleanCouncil(r.registrationCouncil);
    const number = cleanRegistrationNumber(r.registrationNumber);
    const outcome: ImportOutcome = { registration: `${council} / ${number}`, action: 'unchanged', details: [], warnings: [] };
    outcomes.push(outcome);

    const dupKey = licenseKey(council, number);
    if (seen.has(dupKey)) {
      outcome.action = 'error';
      outcome.details.push('Duplicate registration within the same file');
      continue;
    }
    seen.add(dupKey);

    const existing = await findByRegistration(em, council, number);
    if (existing?.isDemo) {
      outcome.action = 'error';
      outcome.details.push('Matches a demo profile; refusing to touch it');
      continue;
    }

    // Same person under a different registration is suspicious, but may be legitimate (two councils).
    const lookalike = await em
      .getRepository(Doctor)
      .createQueryBuilder('d')
      .innerJoin('d.user', 'u')
      .where('d.isDemo = false AND lower(u.name) = :n AND lower(d.specialization) = :s AND d.id != :id', {
        n: r.fullName.trim().toLowerCase(),
        s: r.specialization.toLowerCase(),
        id: existing?.id ?? '00000000-0000-0000-0000-000000000000',
      })
      .getCount();
    if (lookalike > 0) {
      outcome.warnings.push('Another real profile has the same name and specialization; check this is not a duplicate person');
    }

    const education = r.qualifications.map((q) => ({
      degree: q.degree,
      institution: q.institution ?? null,
      year: q.year ?? null,
    }));

    // Doctor columns this record supplies. `undefined` means "not supplied: leave alone".
    const fields: Partial<Doctor> = {
      specialization: r.specialization,
      registrationCouncil: council,
      registrationNumber: number,
      ...(r.registrationYear !== undefined && { registrationYear: r.registrationYear }),
      education,
      ...(r.careerStartYear !== undefined && { careerStartYear: r.careerStartYear }),
      ...(r.statedExperienceYears !== undefined && {
        experienceYears: r.statedExperienceYears,
        experienceSource: r.experienceSource ?? null,
      }),
      ...(r.clinicName !== undefined && { clinicName: r.clinicName }),
      ...(r.city !== undefined && { city: r.city }),
      ...(r.address !== undefined && { address: r.address }),
      ...(r.consultationMode !== undefined && { consultationMode: r.consultationMode }),
      ...(r.consultationFeeInr !== undefined && { consultationFee: r.consultationFeeInr }),
      ...(r.languages !== undefined && { languages: r.languages }),
      ...(r.bio !== undefined && { bio: r.bio }),
      ...(r.photoAttribution !== undefined && r.photoUrl !== undefined && { photoAttribution: r.photoAttribution }),
      profileSource: r.source.name,
      profileSourceUrl: r.source.url ?? null,
      profileSourceRetrievedAt: r.source.retrievedAt,
      profileSourcePermission: r.source.permission,
    };

    if (!existing) {
      const user = await em.save(
        em.create(User, {
          phone: placeholderPhone(council, number),
          name: r.fullName,
          role: UserRole.DOCTOR,
          gender: r.gender,
          avatarUrl: r.photoUrl,
          isActive: true,
          isVerified: false,
        }),
      );
      await em.save(
        em.create(Doctor, {
          userId: user.id,
          licenseNumber: licenseKey(council, number),
          languages: [],
          // Unknown stays unknown: no fee, no experience, no rating, no availability.
          consultationFee: null,
          experienceYears: null,
          consultationMode: ConsultationMode.BOTH,
          isDemo: false,
          isVerified: false,
          verificationStatus: 'unverified',
          ...fields,
        }),
      );
      outcome.action = 'create';
      outcome.details.push('new unverified profile');
      continue;
    }

    // Update in place. A cosmetic difference in how the council is spelled is not a change.
    if (existing.registrationCouncil && councilKey(existing.registrationCouncil) === councilKey(council)) {
      delete fields.registrationCouncil;
    }
    const changed: string[] = [];
    for (const [key, value] of Object.entries(fields) as Array<[keyof Doctor, unknown]>) {
      if (!same(existing[key], value)) {
        changed.push(String(key));
        (existing as unknown as Record<string, unknown>)[key] = value;
      }
    }
    const user = existing.user;
    const userChanges: string[] = [];
    if (user.name !== r.fullName) {
      user.name = r.fullName;
      userChanges.push('name');
    }
    if (r.gender !== undefined && user.gender !== r.gender) {
      user.gender = r.gender;
      userChanges.push('gender');
    }
    if (r.photoUrl !== undefined && user.avatarUrl !== r.photoUrl) {
      user.avatarUrl = r.photoUrl;
      userChanges.push('photo');
    }

    // A changed name on a verified profile no longer matches what was checked on the register.
    if (userChanges.includes('name') && existing.isVerified) {
      existing.isVerified = false;
      existing.verificationStatus = 'unverified';
      existing.verifiedAt = null;
      existing.verifiedBy = null;
      existing.verificationMethod = null;
      existing.verificationReference = null;
      changed.push('verification (reset: name changed)');
      outcome.warnings.push('Name changed on a verified profile; verification was reset and must be redone');
    }

    if (changed.length === 0 && userChanges.length === 0) {
      outcome.action = 'unchanged';
      continue;
    }
    if (userChanges.length > 0) await em.save(user);
    await em.save(existing);
    outcome.action = 'update';
    outcome.details.push(...changed, ...userChanges.map((c) => `user.${c}`));
  }
  return outcomes;
}

// ── Verification ──────────────────────────────────────────────────────────────

export const VERIFICATION_METHODS = [
  'NMC_PORTAL_MANUAL', // an authorised person looked the doctor up on the NMC Indian Medical Register
  'STATE_COUNCIL_MANUAL', // ... on the State Medical Council's own register
  'HPR_API', // ABDM Healthcare Professionals Registry API (needs ABDM credentials)
  'LICENSED_PROVIDER_API', // a commercial NMC verification provider under contract
] as const;
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];

export interface VerifyInput {
  council: string;
  number: string;
  /** The name exactly as the register shows it; must match the profile name. */
  registeredName: string;
  method: VerificationMethod;
  /** Evidence pointer: lookup date plus a ticket, screenshot id or API request id. */
  reference: string;
  /** Who performed the check. */
  by: string;
}

export class VerificationError extends Error {}

export async function verifyDoctor(em: EntityManager, input: VerifyInput, now = new Date()): Promise<Doctor> {
  if (!VERIFICATION_METHODS.includes(input.method)) {
    throw new VerificationError(`Unknown verification method "${input.method}"`);
  }
  if (input.reference.trim().length < 4) throw new VerificationError('A verification reference is required');
  if (input.by.trim().length < 2) throw new VerificationError('The person who performed the check must be named');

  const doctor = await findByRegistration(em, input.council, input.number);
  if (!doctor) throw new VerificationError('No imported doctor with that registration');
  if (doctor.isDemo) throw new VerificationError('Demo profiles can never be verified');
  if (doctor.userId && !doctor.user) throw new VerificationError('Profile has no user');

  if (normalizeName(doctor.user.name) !== normalizeName(input.registeredName)) {
    throw new VerificationError(
      `Name on the register ("${input.registeredName}") does not match the profile ("${doctor.user.name}"). Fix the profile via import first.`,
    );
  }

  doctor.verificationStatus = 'verified';
  doctor.isVerified = true;
  doctor.verifiedAt = now;
  doctor.verifiedBy = input.by.trim();
  doctor.verificationMethod = input.method;
  doctor.verificationReference = input.reference.trim();
  return em.save(doctor);
}

/** Withdraws or rejects verification (e.g. registration lapsed or lookup failed). */
export async function revokeDoctor(
  em: EntityManager,
  council: string,
  number: string,
  status: 'unverified' | 'rejected',
): Promise<Doctor> {
  const doctor = await findByRegistration(em, council, number);
  if (!doctor) throw new VerificationError('No imported doctor with that registration');
  if (doctor.isDemo) throw new VerificationError('Demo profiles are not part of this workflow');
  doctor.isVerified = false;
  doctor.verificationStatus = status;
  doctor.verifiedAt = null;
  doctor.verifiedBy = null;
  doctor.verificationMethod = null;
  doctor.verificationReference = null;
  return em.save(doctor);
}
