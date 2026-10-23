/**
 * Creates fictional STAGING test accounts for video-consultation testing. Run with:
 *   npm run staging:video-fixture -- --doctor-phone +91XXXXXXXXXX --patient-phone +91YYYYYYYYYY --confirm-db <DB_NAME>
 *   ... same command plus --apply to write (default is a dry run that rolls back)
 *
 * Refuses to run unless NODE_ENV=development, STAGING_FIXTURES_ENABLED=true, the database host is local, no
 * hosting-platform variables are present, and --confirm-db repeats the exact database name. It only creates or
 * updates records it can identify as its own (reserved @staging.invalid emails, fixed licence key); a phone number
 * belonging to any other account aborts the run untouched. The doctor profile is never verified and has no
 * registration number. See src/modules/doctors/staging/staging-fixture.ts.
 *
 * Choose phone numbers you control: in development the login OTP is printed to the backend console, so no SMS is sent.
 */
import 'reflect-metadata';
import { config } from 'dotenv';
import { join } from 'path';

config({ path: join(__dirname, '..', '..', '..', '.env') });

import { AppDataSource } from '../data-source';
import {
  FixtureDryRun,
  FixtureOutcome,
  StagingFixtureError,
  assertStagingEnvironment,
  ensureStagingFixtures,
  parseFixturePhones,
} from '../../modules/doctors/staging/staging-fixture';
import { clearDoctorCaches } from './doctor-cli.util';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  try {
    assertStagingEnvironment(
      process.env,
      { host: process.env.DB_HOST, name: process.env.DB_NAME, ssl: process.env.DB_SSL === 'true' },
      arg('confirm-db'),
    );
    const phones = parseFixturePhones(arg('doctor-phone'), arg('patient-phone'));

    await AppDataSource.initialize();
    let outcomes: FixtureOutcome[] = [];
    try {
      await AppDataSource.transaction(async (em) => {
        outcomes = await ensureStagingFixtures(em, phones);
        if (!apply) throw new FixtureDryRun(outcomes);
      });
    } catch (err) {
      if (!(err instanceof FixtureDryRun)) throw err;
    } finally {
      await AppDataSource.destroy();
    }
    for (const o of outcomes) console.log(`  ${o.action.toUpperCase().padEnd(9)} ${o.record}${o.details.length ? ` (${o.details.join(', ')})` : ''}`);
    if (!apply) {
      console.log('Dry run only; nothing was written. Re-run with --apply to create these records.');
      return;
    }
    await clearDoctorCaches();
    console.log('Done. Sign in on each phone with its number; the OTP is printed in the backend console.');
  } catch (err) {
    if (err instanceof StagingFixtureError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
