/**
 * Imports REAL, sourced doctor profiles from a JSON file. Run with:
 *   npm run doctors:import -- <file.json>            dry run (default): validates and reports, writes nothing
 *   npm run doctors:import -- <file.json> --apply    performs the import in one transaction
 *
 * The file is an array of records (see modules/doctors/import/doctor-import.schema.ts). Each record must
 * name its source, retrieval date and the permission under which the data may be used. Records are
 * imported UNVERIFIED and are not shown publicly until `npm run doctors:verify` records a successful
 * registration check. There is intentionally no scraper here: data comes from files you are entitled to
 * use (doctor-supplied forms, a licensed provider's export, ABDM HPR once credentials exist).
 *
 * Idempotent and non-destructive: keyed on (council, registration number); never touches demo doctors,
 * never deletes, preserves doctor/user ids and appointment relations.
 */
import 'reflect-metadata';
import { config } from 'dotenv';
import { join } from 'path';
import { readFileSync } from 'fs';

config({ path: join(__dirname, '..', '..', '..', '.env') });

import { AppDataSource } from '../data-source';
import { DoctorImportFileSchema } from '../../modules/doctors/import/doctor-import.schema';
import { DryRunRollback, ImportOutcome, importDoctors } from '../../modules/doctors/import/doctor-import.service';
import { clearDoctorCaches } from './doctor-cli.util';

function report(outcomes: ImportOutcome[]): void {
  for (const o of outcomes) {
    const detail = o.details.length ? ` (${o.details.join(', ')})` : '';
    console.log(`  ${o.action.toUpperCase().padEnd(9)} ${o.registration}${detail}`);
    for (const w of o.warnings) console.log(`            warning: ${w}`);
  }
  const count = (a: string) => outcomes.filter((o) => o.action === a).length;
  console.log(
    `Summary: ${count('create')} created, ${count('update')} updated, ${count('unchanged')} unchanged, ${count('error')} errors.`,
  );
}

async function main(): Promise<void> {
  const [file, ...flags] = process.argv.slice(2);
  const apply = flags.includes('--apply');
  if (!file) {
    console.error('Usage: npm run doctors:import -- <file.json> [--apply]');
    process.exit(1);
  }
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DOCTOR_IMPORT_IN_PRODUCTION !== 'true') {
    console.error('Refusing to import with NODE_ENV=production unless ALLOW_DOCTOR_IMPORT_IN_PRODUCTION=true.');
    process.exit(1);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`Cannot read ${file} as JSON: ${(err as Error).message}`);
    process.exit(1);
  }
  const parsed = DoctorImportFileSchema.safeParse(raw);
  if (!parsed.success) {
    console.error('Validation failed; nothing was imported:');
    for (const issue of parsed.error.issues.slice(0, 50)) {
      console.error(`  [${issue.path.join('.')}] ${issue.message}`);
    }
    process.exit(1);
  }

  await AppDataSource.initialize();
  let outcomes: ImportOutcome[] = [];
  try {
    await AppDataSource.transaction(async (em) => {
      outcomes = await importDoctors(em, parsed.data);
      const failed = outcomes.some((o) => o.action === 'error');
      // Any error aborts everything: either the whole file is imported or none of it.
      if (failed || !apply) throw new DryRunRollback(outcomes);
    });
  } catch (err) {
    if (!(err instanceof DryRunRollback)) throw err;
  } finally {
    await AppDataSource.destroy();
  }

  report(outcomes);
  if (outcomes.some((o) => o.action === 'error')) {
    console.error('Errors found: nothing was written.');
    process.exit(1);
  }
  if (!apply) {
    console.log('Dry run only. Re-run with --apply to write these changes.');
    return;
  }
  console.log('Imported. Doctors stay hidden until verified (npm run doctors:verify).');
  await clearDoctorCaches();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
