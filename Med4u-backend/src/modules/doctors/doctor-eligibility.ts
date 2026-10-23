import { FindOptionsWhere } from 'typeorm';
import { Doctor } from '../../database/entities/doctor.entity';

/**
 * Who may be listed publicly and booked.
 *
 * Normal rule (unchanged): a doctor is listable and bookable when verified, or when a clearly labelled demo.
 * Staging rule (test-only): a doctor flagged `is_staging_fixture` is ALSO eligible, but only while
 * `stagingFixturesEnabled()` is true, and may then be booked only by staging test accounts. A fixture is never
 * marked verified and never carries a registration number (database constraint), so no fictional evidence exists.
 */

/** Staging accounts use the reserved `.invalid` TLD, which can never be a real mailbox. */
export const STAGING_EMAIL_DOMAIN = '@staging.invalid';

/** True only for a local development run that explicitly opted in. Production can never enable it. */
export function stagingFixturesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'development' && env.STAGING_FIXTURES_ENABLED === 'true';
}

export const isStagingAccount = (email?: string | null): boolean =>
  typeof email === 'string' && email.toLowerCase().endsWith(STAGING_EMAIL_DOMAIN);

/** SQL fragment for query builders: which doctors appear in public listings. */
export function listableSql(alias: string, allowStaging: boolean): string {
  const base = `${alias}.isVerified = true OR ${alias}.isDemo = true`;
  return allowStaging ? `(${base} OR ${alias}.isStagingFixture = true)` : `(${base})`;
}

/** `where` options that find a doctor by id only if it is bookable. */
export function bookableWhere(id: string, allowStaging: boolean): FindOptionsWhere<Doctor>[] {
  return [
    { id, isVerified: true },
    { id, isDemo: true },
    ...(allowStaging ? [{ id, isStagingFixture: true }] : []),
  ];
}

export function isPubliclyVisible(
  doctor: Pick<Doctor, 'isVerified' | 'isDemo' | 'isStagingFixture'>,
  allowStaging: boolean,
): boolean {
  return Boolean(doctor.isVerified || doctor.isDemo || (allowStaging && doctor.isStagingFixture));
}
