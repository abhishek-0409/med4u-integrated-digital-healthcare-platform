/**
 * Retention: deletes stored certificate files of REJECTED doctor applications decided more than N days ago
 * (default 90) that are not open to resubmission. Rows and the audit trail are kept. Run with:
 *   npm run applications:purge                 (dry run: reports how many files would be deleted)
 *   npm run applications:purge -- --apply [--days 90]
 */
import 'reflect-metadata';
import { config } from 'dotenv';
import { join } from 'path';
import { readdir, rm } from 'fs/promises';

config({ path: join(__dirname, '..', '..', '..', '.env.local') });
config({ path: join(__dirname, '..', '..', '..', '.env') });

import { AppDataSource } from '../data-source';
import { DoctorApplicationDocument } from '../entities/doctor-application-document.entity';
import { REJECTED_DOCUMENT_RETENTION_DAYS } from '../../modules/doctor-applications/doctor-application.service';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const di = process.argv.indexOf('--days');
  const days = di >= 0 ? Number(process.argv[di + 1]) : REJECTED_DOCUMENT_RETENTION_DAYS;
  if (!Number.isInteger(days) || days < 1) throw new Error('--days must be a positive integer');
  const dir = process.env.DOCTOR_DOCUMENT_STORAGE_DIR ?? join(process.cwd(), 'storage', 'doctor-documents');

  await AppDataSource.initialize();
  try {
    const docs = await AppDataSource.getRepository(DoctorApplicationDocument)
      .createQueryBuilder('d')
      .innerJoin('doctor_applications', 'a', 'a.id = d.application_id')
      .where(
        "a.status = 'REJECTED' AND a.resubmission_allowed = false AND a.decided_at < now() - make_interval(days => :days)",
        { days },
      )
      .andWhere('d.purged_at IS NULL')
      .getMany();
    console.log(`${docs.length} document file(s) ${apply ? 'will be deleted' : 'would be deleted (dry run)'}.`);
    if (!apply) return;
    const present = new Set(await readdir(dir).catch(() => [] as string[]));
    for (const d of docs) {
      if (present.has(d.storageKey)) await rm(join(dir, d.storageKey), { force: true });
      await AppDataSource.getRepository(DoctorApplicationDocument).update(d.id, { purgedAt: new Date() });
    }
  } finally {
    await AppDataSource.destroy();
  }
}

void main();
