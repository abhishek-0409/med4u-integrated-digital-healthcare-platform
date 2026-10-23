import { HOSTING_MARKERS } from '../doctors/staging/staging-fixture';

/**
 * Development-only demo doctor login.
 *
 * The reserved number 1111111112 (normalised to +911111111112, which is not a routable mobile number) may sign in
 * with a fixed one-time code from DEMO_DOCTOR_OTP, and ONLY when all of these hold: NODE_ENV is exactly
 * "development", DEMO_DOCTOR_LOGIN_ENABLED=true, and no hosting-platform variable is present. Startup validation
 * (config/env.validation.ts) refuses to boot with the flag set anywhere else. Every other phone number always goes
 * through the real OTP flow; this module never creates accounts or assigns roles (see seeds/seed-demo-doctor.ts).
 */
export const DEMO_DOCTOR_PHONE = '+911111111112';
export const DEMO_EMAIL_DOMAIN = '@demo.invalid';
export const DEMO_DOCTOR_EMAIL = `demo-doctor${DEMO_EMAIL_DOMAIN}`;
export const DEMO_PATIENT_EMAIL = `demo-patient${DEMO_EMAIL_DOMAIN}`;
export const DEMO_VIDEO_PATIENT_PHONE = '+911111111113';
export const DEMO_VIDEO_PATIENT_EMAIL = 'demo-video-patient@staging.invalid';
export const DEMO_DOCTOR_LICENSE = 'DEMO-LOGIN-SYNTHETIC';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Markers used only by the separately seeded, synthetic patient login. */
export const isDemoVideoTestPatientPhone = (phone: string): boolean =>
  phone === DEMO_VIDEO_PATIENT_PHONE;
export const isDemoVideoTestPatientEmail = (email?: string | null): boolean =>
  typeof email === 'string' && email.toLowerCase() === DEMO_VIDEO_PATIENT_EMAIL;

/** The login doctor is call-testable only in explicitly enabled local development. */
export function demoDoctorVideoEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return demoDoctorLoginEnabled(env);
}

/** The patient allowlist is a backend-only user id and is active only on a local development database. */
export function demoVideoTestPatientEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const id = env.DEMO_VIDEO_TEST_PATIENT_USER_ID;
  const host = (env.DB_HOST ?? 'localhost').toLowerCase();
  return (
    demoDoctorVideoEnabled(env) &&
    !!id &&
    UUID_PATTERN.test(id) &&
    ['localhost', '127.0.0.1', '::1'].includes(host) &&
    env.DB_SSL !== 'true'
  );
}

export function demoVideoTestPatientConfigProblem(env: NodeJS.ProcessEnv): string | null {
  const id = env.DEMO_VIDEO_TEST_PATIENT_USER_ID;
  if (!id) return null;
  if (!UUID_PATTERN.test(id)) return 'DEMO_VIDEO_TEST_PATIENT_USER_ID must be a UUID.';
  if (!demoDoctorVideoEnabled(env)) {
    return 'DEMO_VIDEO_TEST_PATIENT_USER_ID requires the local demo doctor feature to be enabled.';
  }
  if (!['localhost', '127.0.0.1', '::1'].includes((env.DB_HOST ?? 'localhost').toLowerCase())) {
    return 'DEMO_VIDEO_TEST_PATIENT_USER_ID may only be configured with a local database host.';
  }
  if (env.DB_SSL === 'true') {
    return 'DEMO_VIDEO_TEST_PATIENT_USER_ID may not be configured with DB_SSL=true.';
  }
  return null;
}

export function isDemoVideoTestParticipant(
  doctor: { isDemo: boolean; licenseNumber: string },
  patientUserId: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    doctor.isDemo &&
    doctor.licenseNumber === DEMO_DOCTOR_LICENSE &&
    demoVideoTestPatientEnabled(env) &&
    patientUserId === env.DEMO_VIDEO_TEST_PATIENT_USER_ID
  );
}

export function demoDoctorLoginEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.NODE_ENV === 'development' &&
    env.DEMO_DOCTOR_LOGIN_ENABLED === 'true' &&
    !HOSTING_MARKERS.some((m) => env[m]) &&
    /^\d{6}$/.test(env.DEMO_DOCTOR_OTP ?? '')
  );
}

/** Why the flag is unacceptable in this environment, or null when it is fine (or unset). */
export function demoDoctorConfigProblem(env: NodeJS.ProcessEnv): string | null {
  if (env.DEMO_DOCTOR_LOGIN_ENABLED !== 'true') return null;
  if (env.NODE_ENV !== 'development') {
    return 'DEMO_DOCTOR_LOGIN_ENABLED may only be true when NODE_ENV=development.';
  }
  const marker = HOSTING_MARKERS.find((m) => env[m]);
  if (marker)
    return `DEMO_DOCTOR_LOGIN_ENABLED must not be set on a hosted environment (${marker} is present).`;
  if (env.DB_SSL === 'true')
    return 'DEMO_DOCTOR_LOGIN_ENABLED must not be set against an SSL (remote) database.';
  if (!/^\d{6}$/.test(env.DEMO_DOCTOR_OTP ?? '')) {
    return 'DEMO_DOCTOR_OTP (exactly 6 digits) is required when DEMO_DOCTOR_LOGIN_ENABLED=true.';
  }
  return null;
}

export const isDemoAccountEmail = (email?: string | null): boolean =>
  typeof email === 'string' && email.toLowerCase().endsWith(DEMO_EMAIL_DOMAIN);

export const isDemoDoctorPhone = (phone: string): boolean => phone === DEMO_DOCTOR_PHONE;
