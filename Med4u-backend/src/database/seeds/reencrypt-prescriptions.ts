/**
 * Re-encrypts stored prescription files under the current ENCRYPTION_KEY. Run with:
 *   npm run prescriptions:reencrypt              dry run: opens every file, reports, writes nothing
 *   npm run prescriptions:reencrypt -- --apply   re-encrypts
 *
 * Rotation procedure (see docs/SECRETS_ROTATION.md):
 *   1. Take a backup of storage/ and the database.
 *   2. Set ENCRYPTION_KEY=<new>, ENCRYPTION_KEY_ID=<n+1>, ENCRYPTION_KEY_PREVIOUS=<old>, ENCRYPTION_KEY_PREVIOUS_ID=<n or 0 for
 *      files written before key ids existed>.
 *   3. Run this script (dry run, then --apply). Keep the previous key and the backup until the app is verified.
 *
 * Per file, in order: decrypt with whichever configured key opens it; encrypt under the current key;
 * decrypt the NEW bytes and compare SHA-256 with the original plaintext; copy the original into
 * storage/prescriptions.pre-reencrypt-<timestamp>/; only then replace the file (write temp + rename).
 * Any failure stops the run for that file and leaves it untouched. Files already under the current key are skipped.
 * Plaintext is never written to disk or printed.
 */
/// <reference path="./pg.d.ts" />
import 'reflect-metadata';
import { config } from 'dotenv';
import { join, resolve } from 'path';
import { createHash } from 'crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'fs';
import { Client } from 'pg';
import { buildKeyRing, decrypt, encrypt } from '../../modules/prescriptions/prescription-crypto';

config({ path: join(__dirname, '..', '..', '..', '.env') });

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const KEY_PATTERN = /^[a-f0-9]{32}$/;

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    console.error('ENCRYPTION_KEY is missing or shorter than 32 characters.');
    process.exit(1);
  }
  const ring = buildKeyRing({
    currentSecret: secret,
    currentId: Number(process.env.ENCRYPTION_KEY_ID ?? 1),
    previousSecret: process.env.ENCRYPTION_KEY_PREVIOUS || undefined,
    previousId: Number(process.env.ENCRYPTION_KEY_PREVIOUS_ID ?? 0),
  });

  const dir = resolve(process.env.PRESCRIPTION_STORAGE_DIR ?? join(process.cwd(), 'storage', 'prescriptions'));
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => KEY_PATTERN.test(f)) : [];

  // Cross-check files against database rows so nothing is silently missing.
  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  await client.connect();
  const rows = (await client.query<{ k: string }>('SELECT storage_key AS k FROM prescription_uploads')).rows.map((r) => r.k);
  await client.end();
  const missing = rows.filter((k) => !files.includes(k));
  const orphans = files.filter((f) => !rows.includes(f));
  console.log(`Files on disk: ${files.length}; database rows: ${rows.length}; rows without a file: ${missing.length}; files without a row: ${orphans.length}`);
  if (missing.length) console.warn('WARNING: some database rows have no file (already lost before this run).');

  const backupDir = join(dir, '..', `prescriptions.pre-reencrypt-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  let converted = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const f of files) {
    const path = join(dir, f);
    try {
      const raw = readFileSync(path);
      const opened = decrypt(raw, ring);
      if (opened.format === 'v1' && opened.keyId === ring.current.id) {
        skipped += 1;
        continue;
      }
      const next = encrypt(opened.plain, ring);
      const check = decrypt(next, ring);
      if (check.keyId !== ring.current.id || sha(check.plain) !== sha(opened.plain)) {
        throw new Error('verification of the re-encrypted bytes failed');
      }
      console.log(`  ${f.slice(0, 8)}…  ${opened.format}/key ${opened.keyId} -> v1/key ${ring.current.id}${apply ? '' : ' (dry run)'}`);
      if (apply) {
        mkdirSync(backupDir, { recursive: true, mode: 0o700 });
        copyFileSync(path, join(backupDir, f));
        if (sha(readFileSync(join(backupDir, f))) !== sha(raw)) throw new Error('backup copy does not match the original');
        const tmp = `${path}.tmp`;
        writeFileSync(tmp, next, { mode: 0o600 });
        renameSync(tmp, path);
        // Final proof from disk.
        if (sha(decrypt(readFileSync(path), ring).plain) !== sha(opened.plain)) throw new Error('post-write read-back failed');
      }
      converted += 1;
    } catch (err) {
      failures.push(f);
      console.error(`  FAILED ${f.slice(0, 8)}…: ${(err as Error).message}`);
    }
  }

  console.log(
    `${apply ? 'Re-encrypted' : 'Would re-encrypt'}: ${converted}; already current: ${skipped}; failed: ${failures.length}.` +
      (apply && converted ? ` Originals kept in ${backupDir}` : ''),
  );
  if (failures.length || missing.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
