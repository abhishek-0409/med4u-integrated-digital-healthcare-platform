/**
 * Records the outcome of a medical-registration check for an imported doctor. Run with:
 *   npm run doctors:verify -- --council "<council>" --number "<reg no>" --registered-name "<name on register>" \
 *       --method NMC_PORTAL_MANUAL --reference "<lookup date + ticket/screenshot id>" --by "<your name>"
 *   npm run doctors:verify -- --council "<council>" --number "<reg no>" --revoke [--reject]
 *
 * This tool does not look anything up: no authorised registry API is configured. It records an
 * attestation that someone checked the doctor on the NMC Indian Medical Register (or the state council's
 * register) and refuses to proceed unless the name on the register matches the profile, a method and an
 * evidence reference are given, and the doctor is not a demo profile.
 */
import 'reflect-metadata';
import { config } from 'dotenv';
import { join } from 'path';

config({ path: join(__dirname, '..', '..', '..', '.env') });

import { AppDataSource } from '../data-source';
import {
  VerificationError,
  VerificationMethod,
  revokeDoctor,
  verifyDoctor,
} from '../../modules/doctors/import/doctor-import.service';
import { clearDoctorCaches } from './doctor-cli.util';

function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const a = parseArgs(process.argv.slice(2));
  const council = typeof a.council === 'string' ? a.council : '';
  const number = typeof a.number === 'string' ? a.number : '';
  if (!council || !number) {
    console.error('Required: --council and --number. See the header of verify-doctor.ts for usage.');
    process.exit(1);
  }
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DOCTOR_IMPORT_IN_PRODUCTION !== 'true') {
    console.error('Refusing to change verification with NODE_ENV=production unless ALLOW_DOCTOR_IMPORT_IN_PRODUCTION=true.');
    process.exit(1);
  }

  await AppDataSource.initialize();
  try {
    if (a.revoke) {
      const d = await AppDataSource.transaction((em) =>
        revokeDoctor(em, council, number, a.reject ? 'rejected' : 'unverified'),
      );
      console.log(`Verification withdrawn: ${d.registrationCouncil} / ${d.registrationNumber} is now ${d.verificationStatus}.`);
    } else {
      const method = String(a.method ?? '') as VerificationMethod;
      const d = await AppDataSource.transaction((em) =>
        verifyDoctor(em, {
          council,
          number,
          registeredName: String(a['registered-name'] ?? ''),
          method,
          reference: String(a.reference ?? ''),
          by: String(a.by ?? ''),
        }),
      );
      console.log(`Verified: ${d.registrationCouncil} / ${d.registrationNumber} via ${d.verificationMethod} by ${d.verifiedBy}.`);
    }
    await clearDoctorCaches();
  } catch (err) {
    if (err instanceof VerificationError) {
      console.error(`Not changed: ${err.message}`);
      process.exitCode = 1;
    } else {
      throw err;
    }
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
