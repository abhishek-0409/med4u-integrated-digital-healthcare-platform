/**
 * Creates the local demo doctor accounts. Run with:
 *   npm run demo:doctor -- --confirm-db <DB_NAME>            (dry run: shows what would be created, rolls back)
 *   npm run demo:doctor -- --confirm-db <DB_NAME> --apply    (writes)
 * Add --with-video-patient to create an isolated, synthetic local patient login for calls.
 * Add --with-patient-stub to also create the inactive synthetic patient stub (off by default).
 *
 * Refuses unless NODE_ENV=development, DEMO_DOCTOR_LOGIN_ENABLED=true (with DEMO_DOCTOR_OTP), the database host is
 * local, and --confirm-db repeats the exact DB_NAME. Never touches an account it cannot identify as its own.
 */
import 'reflect-metadata';
import { config } from 'dotenv';
import { join } from 'path';

config({ path: join(__dirname, '..', '..', '..', '.env.local') });
config({ path: join(__dirname, '..', '..', '..', '.env') });

import { AppDataSource } from '../data-source';
import { clearDoctorCaches } from './doctor-cli.util';
import {
  DemoOutcome,
  DemoSeedError,
  assertDemoSeedEnvironment,
  ensureDemoAccounts,
} from '../../modules/auth/demo-seed';

class DryRun extends Error {}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : undefined;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  try {
    assertDemoSeedEnvironment(
      process.env,
      { host: process.env.DB_HOST, name: process.env.DB_NAME },
      arg('confirm-db'),
    );
    await AppDataSource.initialize();
    let outcomes: DemoOutcome[] = [];
    try {
      await AppDataSource.transaction(async (em) => {
        outcomes = await ensureDemoAccounts(em, {
          patientStub: process.argv.includes('--with-patient-stub'),
          videoPatient: process.argv.includes('--with-video-patient'),
        });
        if (!apply) throw new DryRun();
      });
    } catch (err) {
      if (!(err instanceof DryRun)) throw err;
    } finally {
      await AppDataSource.destroy();
    }
    for (const o of outcomes) console.log(`  ${o.action.toUpperCase().padEnd(9)} ${o.record}`);
    console.log(
      apply
        ? 'Done. The demo doctor signs in with 1111111112 and DEMO_DOCTOR_OTP; the synthetic patient uses the normal local OTP flow.'
        : 'Dry run only; nothing was written.',
    );
    if (apply) await clearDoctorCaches();
  } catch (err) {
    if (err instanceof DemoSeedError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

void main();
