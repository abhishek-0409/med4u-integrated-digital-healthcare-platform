import { EntityManager } from 'typeorm';
import { isDeepStrictEqual } from 'node:util';
import { Doctor, ConsultationMode } from '../../database/entities/doctor.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import {
  DEMO_DOCTOR_EMAIL,
  DEMO_DOCTOR_LICENSE,
  DEMO_DOCTOR_PHONE,
  DEMO_PATIENT_EMAIL,
  DEMO_VIDEO_PATIENT_EMAIL,
  DEMO_VIDEO_PATIENT_PHONE,
  demoDoctorConfigProblem,
} from './demo-doctor';

/**
 * Creates the local demo accounts. This is the ONLY place the demo number gains a doctor role: an ordinary
 * login never does. Everything it creates is labelled synthetic:
 *  - a doctor-role user (+911111111112) with a clearly labelled fictional demo profile (never verified);
 *  - optionally (opt-in only) one INACTIVE synthetic patient stub that can never sign in.
 */
export { DEMO_DOCTOR_LICENSE } from './demo-doctor';
export const DEMO_PATIENT_PHONE = '+910000000001';

export class DemoSeedError extends Error {}

export function assertDemoSeedEnvironment(
  env: NodeJS.ProcessEnv,
  db: { host?: string; name?: string },
  confirmedDbName: string | undefined,
): void {
  const problems: string[] = [];
  if (env.NODE_ENV !== 'development') problems.push('NODE_ENV must be exactly "development"');
  if (env.DEMO_DOCTOR_LOGIN_ENABLED !== 'true') {
    problems.push('DEMO_DOCTOR_LOGIN_ENABLED=true is required (explicit opt-in)');
  } else {
    const p = demoDoctorConfigProblem(env);
    if (p) problems.push(p);
  }
  if (!db.host || !['localhost', '127.0.0.1', '::1'].includes(db.host.toLowerCase())) {
    problems.push('DB_HOST must be localhost, 127.0.0.1 or ::1');
  }
  if (!db.name || /prod|live/i.test(db.name))
    problems.push('DB_NAME is missing or looks like a production database');
  if (!confirmedDbName || confirmedDbName !== db.name) {
    problems.push('--confirm-db must repeat the exact DB_NAME you intend to modify');
  }
  if (problems.length > 0)
    throw new DemoSeedError(`Refusing to run:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
}

export interface DemoOutcome {
  record: string;
  action: 'created' | 'updated' | 'unchanged';
}

/** The inactive synthetic patient stub is created only when explicitly requested (`--with-patient-stub`). */
export async function ensureDemoAccounts(
  em: EntityManager,
  options: { patientStub?: boolean; videoPatient?: boolean } = {},
): Promise<DemoOutcome[]> {
  const out: DemoOutcome[] = [];
  const users = em.getRepository(User);

  let doctorUser = await users.findOne({ where: { phone: DEMO_DOCTOR_PHONE }, withDeleted: true });
  if (doctorUser && doctorUser.email !== DEMO_DOCTOR_EMAIL) {
    throw new DemoSeedError(
      'The demo phone number already belongs to a non-demo account; refusing to touch it.',
    );
  }
  if (doctorUser?.deletedAt)
    throw new DemoSeedError(
      'The demo account is soft-deleted; refusing to restore it automatically.',
    );
  if (
    doctorUser &&
    (doctorUser.role !== UserRole.DOCTOR || !doctorUser.isActive || !doctorUser.isVerified)
  ) {
    throw new DemoSeedError(
      'The existing demo account has unsafe role or login flags; refusing to modify it.',
    );
  }
  if (!doctorUser) {
    doctorUser = await users.save(
      users.create({
        phone: DEMO_DOCTOR_PHONE,
        name: 'DEMO Doctor (Local Video Test)',
        email: DEMO_DOCTOR_EMAIL,
        role: UserRole.DOCTOR,
        isActive: true,
        isVerified: true,
      }),
    );
    out.push({ record: 'demo doctor user', action: 'created' });
  } else {
    if (doctorUser.name !== 'DEMO Doctor (Local Video Test)') {
      doctorUser.name = 'DEMO Doctor (Local Video Test)';
      await users.save(doctorUser);
      out.push({ record: 'demo doctor user display name', action: 'updated' });
    }
    out.push({ record: 'demo doctor user', action: 'unchanged' });
  }

  const doctors = em.getRepository(Doctor);
  const reservedLicense = await doctors.findOne({
    where: { licenseNumber: DEMO_DOCTOR_LICENSE },
    withDeleted: true,
  });
  if (reservedLicense && reservedLicense.userId !== doctorUser.id) {
    throw new DemoSeedError(
      'The demo doctor profile key belongs to another account; refusing to touch it.',
    );
  }
  let demoProfile = await doctors.findOne({ where: { userId: doctorUser.id }, withDeleted: true });
  if (demoProfile?.deletedAt)
    throw new DemoSeedError(
      'The demo profile is soft-deleted; refusing to restore it automatically.',
    );
  if (demoProfile && demoProfile.licenseNumber !== DEMO_DOCTOR_LICENSE) {
    throw new DemoSeedError(
      'The demo account is linked to a profile not owned by this seed; refusing to modify it.',
    );
  }
  const profileFields = {
    specialization: 'General Medicine',
    bio: 'DEMO TEST PROFILE. Fictional account for local development testing only. Not a real practitioner.',
    consultationFee: 10,
    languages: ['English', 'Hindi'],
    education: [{ degree: 'Synthetic demo profile', institution: 'Med4U local testing', year: 0 }],
    city: 'Local development',
    clinicName: 'Med4U Demo Clinic (test only)',
    availabilitySchedule: Object.fromEntries(
      ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => [
        day,
        { start: '09:00', end: '17:00', slotDurationMinutes: 30 },
      ]),
    ),
    consultationMode: ConsultationMode.BOTH,
    isAvailableToday: true,
    isVerified: false,
    isDemo: true,
    isStagingFixture: false,
    verificationStatus: 'unverified' as const,
  };
  if (!demoProfile) {
    demoProfile = doctors.create({
      ...profileFields,
      userId: doctorUser.id,
      licenseNumber: DEMO_DOCTOR_LICENSE,
    });
    await doctors.save(demoProfile);
    out.push({
      record: 'demo doctor profile (listed, fictional, never verified)',
      action: 'created',
    });
  } else if (demoProfile.isVerified || demoProfile.verificationStatus === 'verified') {
    throw new DemoSeedError(
      'The existing demo profile is marked verified; refusing to change or approve it.',
    );
  } else if (demoProfile.licenseNumber !== DEMO_DOCTOR_LICENSE) {
    throw new DemoSeedError(
      'The existing profile is not an unverified synthetic demo; refusing to modify it.',
    );
  } else {
    const changed = Object.entries(profileFields).some(
      ([key, value]) => {
        const current = (demoProfile as unknown as Record<string, unknown>)[key];
        // PostgreSQL returns DECIMAL columns as strings, while TypeORM writes this illustrative fee as a number.
        if (key === 'consultationFee') return Number(current) !== Number(value);
        return !isDeepStrictEqual(current, value);
      },
    );
    if (changed) {
      Object.assign(demoProfile, profileFields);
      await doctors.save(demoProfile);
    }
    out.push({
      record: 'demo doctor profile (listed, fictional, never verified)',
      action: changed ? 'updated' : 'unchanged',
    });
  }

  if (options.videoPatient) {
    const patient = await users.findOne({
      where: { phone: DEMO_VIDEO_PATIENT_PHONE },
      withDeleted: true,
    });
    if (
      patient &&
      (patient.email !== DEMO_VIDEO_PATIENT_EMAIL || patient.role !== UserRole.PATIENT)
    ) {
      throw new DemoSeedError(
        'The video test patient phone belongs to a non-test account; refusing to touch it.',
      );
    }
    if (patient?.deletedAt)
      throw new DemoSeedError(
        'The video test patient is soft-deleted; refusing to restore it automatically.',
      );
    if (!patient) {
      await users.save(
        users.create({
          phone: DEMO_VIDEO_PATIENT_PHONE,
          name: 'DEMO Video Test Patient (synthetic)',
          email: DEMO_VIDEO_PATIENT_EMAIL,
          role: UserRole.PATIENT,
          isActive: true,
          isVerified: true,
        }),
      );
      out.push({ record: 'video test patient (synthetic, active)', action: 'created' });
    } else {
      out.push({ record: 'video test patient (synthetic, active)', action: 'unchanged' });
    }
  }

  if (!options.patientStub) return out;

  const patient = await users.findOne({ where: { phone: DEMO_PATIENT_PHONE }, withDeleted: true });
  if (patient && patient.email !== DEMO_PATIENT_EMAIL) {
    throw new DemoSeedError(
      'The synthetic patient phone number belongs to a non-demo account; refusing to touch it.',
    );
  }
  if (!patient) {
    await users.save(
      users.create({
        phone: DEMO_PATIENT_PHONE,
        name: 'DEMO Patient (synthetic)',
        email: DEMO_PATIENT_EMAIL,
        role: UserRole.PATIENT,
        isActive: false, // can never sign in
        isVerified: false,
      }),
    );
    out.push({ record: 'synthetic patient stub (inactive)', action: 'created' });
  } else {
    out.push({ record: 'synthetic patient stub (inactive)', action: 'unchanged' });
  }
  return out;
}
