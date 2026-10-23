import { EntityManager } from 'typeorm';
import { ConsultationMode, Doctor, AvailabilitySchedule } from '../../../database/entities/doctor.entity';
import { BloodGroup, Gender, User, UserRole } from '../../../database/entities/user.entity';
import { STAGING_EMAIL_DOMAIN } from '../doctor-eligibility';
import { valuesEqual } from '../import/doctor-import.service';

/**
 * Fictional staging test accounts for exercising the video-consultation flow locally.
 *
 * What it creates (and only this): one doctor-role user, one patient-role user, and one doctor profile marked
 * `is_staging_fixture`. The profile is NOT verified and has NO registration number; it is honest about being
 * fictional, and the application honours the flag only in a development environment that opted in.
 * Records are identified by reserved `@staging.invalid` emails and a fixed licence key, so the script can
 * never match, reuse or modify a real account: a phone number that belongs to anything else is an error.
 */

export const STAGING_DOCTOR_EMAIL = `staging-doctor${STAGING_EMAIL_DOMAIN}`;
export const STAGING_PATIENT_EMAIL = `staging-patient${STAGING_EMAIL_DOMAIN}`;
export const STAGING_DOCTOR_LICENSE = 'STAGING-FIXTURE-DOCTOR-1';
export const STAGING_DOCTOR_NAME = 'Staging Test Doctor (fictional)';
export const STAGING_PATIENT_NAME = 'Staging Test Patient (fictional)';

export class StagingFixtureError extends Error {}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
/** Variables that exist on common hosting platforms; any of them means "not a local machine". */
export const HOSTING_MARKERS = [
  'RENDER',
  'RENDER_SERVICE_ID',
  'RAILWAY_ENVIRONMENT',
  'FLY_APP_NAME',
  'VERCEL',
  'DYNO',
  'K_SERVICE',
  'KUBERNETES_SERVICE_HOST',
  'AWS_EXECUTION_ENV',
  'WEBSITE_SITE_NAME',
  'DATABASE_URL',
];

export interface DbIdentity {
  host?: string;
  name?: string;
  ssl?: boolean;
}

/** Throws unless this is unmistakably a local development run that explicitly opted in. */
export function assertStagingEnvironment(
  env: NodeJS.ProcessEnv,
  db: DbIdentity,
  confirmedDbName: string | undefined,
): void {
  const problems: string[] = [];
  if (env.NODE_ENV !== 'development') problems.push('NODE_ENV must be exactly "development"');
  if (env.STAGING_FIXTURES_ENABLED !== 'true') problems.push('STAGING_FIXTURES_ENABLED=true is required (explicit opt-in)');
  const marker = HOSTING_MARKERS.find((m) => env[m]);
  if (marker) problems.push(`hosting-platform variable ${marker} is set; this looks like a hosted environment`);
  if (!db.host || !LOCAL_HOSTS.has(db.host.toLowerCase())) problems.push('DB_HOST must be localhost, 127.0.0.1 or ::1');
  if (db.ssl) problems.push('DB_SSL is enabled, which indicates a remote database');
  if (!db.name) problems.push('DB_NAME is not set');
  else if (/prod|live/i.test(db.name)) problems.push('DB_NAME looks like a production database');
  if (!confirmedDbName || confirmedDbName !== db.name) {
    problems.push('--confirm-db must repeat the exact DB_NAME you intend to modify');
  }
  if (problems.length > 0) {
    throw new StagingFixtureError(`Refusing to run:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }
}

const INDIAN_MOBILE = /^\+91[6-9]\d{9}$/;

export function parseFixturePhones(doctorPhone?: string, patientPhone?: string) {
  const errors: string[] = [];
  if (!doctorPhone || !INDIAN_MOBILE.test(doctorPhone)) errors.push('--doctor-phone must be +91 followed by a 10-digit mobile number');
  if (!patientPhone || !INDIAN_MOBILE.test(patientPhone)) errors.push('--patient-phone must be +91 followed by a 10-digit mobile number');
  if (doctorPhone && doctorPhone === patientPhone) errors.push('the doctor and patient phone numbers must differ');
  if (errors.length > 0) throw new StagingFixtureError(errors.join('; '));
  return { doctorPhone: doctorPhone as string, patientPhone: patientPhone as string };
}

export interface FixtureOutcome {
  record: 'doctor account' | 'patient account' | 'doctor profile';
  action: 'create' | 'update' | 'unchanged';
  details: string[];
}

export class FixtureDryRun extends Error {
  constructor(readonly outcomes: FixtureOutcome[]) {
    super('dry run');
  }
}

const maskPhone = (p: string) => `${p.slice(0, 5)}*****${p.slice(-2)}`;

/** All seven days, 10-minute slots: there is always a slot starting within the 10-minute early-join window. */
const ALL_DAY: AvailabilitySchedule = Object.fromEntries(
  ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => [
    d,
    { start: '00:00', end: '23:50', slotDurationMinutes: 10 },
  ]),
);

async function ensureUser(
  em: EntityManager,
  spec: { phone: string; email: string; name: string; role: UserRole; label: FixtureOutcome['record'] },
): Promise<{ user: User; outcome: FixtureOutcome }> {
  const users = em.getRepository(User);
  const byPhone = await users.findOne({ where: { phone: spec.phone }, withDeleted: true });
  const byEmail = await users.findOne({ where: { email: spec.email }, withDeleted: true });

  if (byPhone && byPhone.email !== spec.email) {
    throw new StagingFixtureError(
      `${maskPhone(spec.phone)} already belongs to an account that is not the ${spec.label}. Refusing to modify it; choose a different number.`,
    );
  }
  if (byEmail && byEmail.phone !== spec.phone) {
    throw new StagingFixtureError(
      `The ${spec.label} already exists under ${maskPhone(byEmail.phone)}. Re-run with that number (the script never re-points accounts).`,
    );
  }

  // Complete profile, so the test phones go straight to Home instead of onboarding.
  const managed = {
    name: spec.name,
    role: spec.role,
    dob: '1990-01-01',
    gender: Gender.PREFER_NOT_TO_SAY,
    bloodGroup: BloodGroup.UNKNOWN,
    isActive: true,
  };

  if (!byPhone) {
    const user = await users.save(users.create({ phone: spec.phone, email: spec.email, isVerified: false, ...managed }));
    return { user, outcome: { record: spec.label, action: 'create', details: [`${maskPhone(spec.phone)} ${spec.email}`] } };
  }
  if (byPhone.deletedAt) {
    throw new StagingFixtureError(`The ${spec.label} was soft-deleted; restore or remove it manually first.`);
  }
  const changed = (Object.keys(managed) as Array<keyof typeof managed>).filter((k) => !valuesEqual(byPhone[k], managed[k]));
  if (changed.length === 0) return { user: byPhone, outcome: { record: spec.label, action: 'unchanged', details: [] } };
  Object.assign(byPhone, managed);
  await users.save(byPhone);
  return { user: byPhone, outcome: { record: spec.label, action: 'update', details: changed.map(String) } };
}

/**
 * Creates or reuses the staging accounts and doctor profile. Idempotent. Run inside a transaction.
 * Never touches an account or profile that is not explicitly the fixture's own.
 */
export async function ensureStagingFixtures(
  em: EntityManager,
  phones: { doctorPhone: string; patientPhone: string },
): Promise<FixtureOutcome[]> {
  const outcomes: FixtureOutcome[] = [];

  const doctorUser = await ensureUser(em, {
    phone: phones.doctorPhone,
    email: STAGING_DOCTOR_EMAIL,
    name: STAGING_DOCTOR_NAME,
    role: UserRole.DOCTOR,
    label: 'doctor account',
  });
  outcomes.push(doctorUser.outcome);
  const patientUser = await ensureUser(em, {
    phone: phones.patientPhone,
    email: STAGING_PATIENT_EMAIL,
    name: STAGING_PATIENT_NAME,
    role: UserRole.PATIENT,
    label: 'patient account',
  });
  outcomes.push(patientUser.outcome);

  const doctors = em.getRepository(Doctor);
  const byLicense = await doctors.findOne({ where: { licenseNumber: STAGING_DOCTOR_LICENSE }, withDeleted: true });
  const byUser = await doctors.findOne({ where: { userId: doctorUser.user.id }, withDeleted: true });
  if (byLicense && (byLicense.userId !== doctorUser.user.id || !byLicense.isStagingFixture)) {
    throw new StagingFixtureError('The staging licence key is linked to a different account or a non-fixture profile; refusing to touch it.');
  }
  if (byUser && !byLicense) {
    throw new StagingFixtureError('The staging doctor account already has a doctor profile that is not the fixture; refusing to touch it.');
  }

  // Everything the fixture manages. Notice what is absent: no registration number, no verification evidence.
  const fields: Partial<Doctor> = {
    specialization: 'General Medicine',
    bio: 'Fictional staging profile used only to test video consultations. Not a real doctor.',
    consultationFee: 10,
    experienceYears: null,
    languages: ['English'],
    education: [],
    city: 'Staging',
    clinicName: 'Staging test clinic (fictional)',
    consultationMode: ConsultationMode.ONLINE,
    availabilitySchedule: ALL_DAY,
    isAvailableToday: true,
    isDemo: false,
    isVerified: false,
    verificationStatus: 'unverified',
    isStagingFixture: true,
    profileSource: 'STAGING TEST FIXTURE (fictional; not a real practitioner)',
  };

  if (!byLicense) {
    await doctors.save(doctors.create({ userId: doctorUser.user.id, licenseNumber: STAGING_DOCTOR_LICENSE, ...fields }));
    outcomes.push({ record: 'doctor profile', action: 'create', details: ['unverified, no registration number'] });
    return outcomes;
  }
  if (byLicense.deletedAt) throw new StagingFixtureError('The staging doctor profile was soft-deleted; remove it manually first.');
  const changed = (Object.keys(fields) as Array<keyof Doctor>).filter((k) => !valuesEqual(byLicense[k], fields[k]));
  if (changed.length === 0) {
    outcomes.push({ record: 'doctor profile', action: 'unchanged', details: [] });
  } else {
    Object.assign(byLicense, fields);
    await doctors.save(byLicense);
    outcomes.push({ record: 'doctor profile', action: 'update', details: changed.map(String) });
  }
  return outcomes;
}
