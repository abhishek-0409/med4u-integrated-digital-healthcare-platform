import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive schema for real (sourced) doctor profiles next to the existing demo doctors.
 *
 * Nothing existing is rewritten: all new columns are nullable (verification_status defaults to
 * 'unverified'), doctor ids and appointment relations are untouched. `consultation_fee` and
 * `experience_years` become nullable so an unknown value can be stored as "not provided" instead
 * of a made-up 0; existing rows keep their values.
 */
export class DoctorProvenance1714600011000 implements MigrationInterface {
  name = 'DoctorProvenance1714600011000';

  async up(q: QueryRunner): Promise<void> {
    const cols: Array<[string, string]> = [
      ['registration_council', 'varchar(120)'],
      ['registration_number', 'varchar(50)'],
      ['registration_year', 'smallint'],
      ['career_start_year', 'smallint'],
      ['experience_source', 'varchar(200)'],
      ['address', 'text'],
      ['photo_attribution', 'varchar(200)'],
      ['profile_source', 'varchar(120)'],
      ['profile_source_url', 'varchar(500)'],
      ['profile_source_retrieved_at', 'date'],
      ['profile_source_permission', 'varchar(300)'],
      ["verification_status", "varchar(16) NOT NULL DEFAULT 'unverified'"],
      ['verified_at', 'timestamptz'],
      ['verified_by', 'varchar(120)'],
      ['verification_method', 'varchar(60)'],
      ['verification_reference', 'varchar(200)'],
    ];
    for (const [name, type] of cols) {
      await q.query(`ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "${name}" ${type}`);
    }

    await q.query(`ALTER TABLE "doctors" ALTER COLUMN "consultation_fee" DROP NOT NULL`);
    await q.query(`ALTER TABLE "doctors" ALTER COLUMN "experience_years" DROP NOT NULL`);

    await q.query(
      `ALTER TABLE "doctors" ADD CONSTRAINT "CHK_doctors_verification_status" CHECK ("verification_status" IN ('unverified','verified','rejected'))`,
    );
    // A demo profile can never be verified. NOT VALID: applies to new writes without rescanning old rows.
    await q.query(
      `ALTER TABLE "doctors" ADD CONSTRAINT "CHK_doctors_demo_never_verified" CHECK (NOT ("is_demo" AND "is_verified")) NOT VALID`,
    );
    // Imported verified status must carry its evidence.
    await q.query(
      `ALTER TABLE "doctors" ADD CONSTRAINT "CHK_doctors_verified_evidence" CHECK ("verification_status" <> 'verified' OR ("verified_at" IS NOT NULL AND "verification_method" IS NOT NULL AND "registration_number" IS NOT NULL))`,
    );
    // One real doctor per (council, registration number), case/space-insensitive.
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_doctors_registration" ON "doctors" (lower("registration_council"), upper("registration_number")) WHERE "registration_number" IS NOT NULL`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "UQ_doctors_registration"`);
    for (const c of ['CHK_doctors_verified_evidence', 'CHK_doctors_demo_never_verified', 'CHK_doctors_verification_status']) {
      await q.query(`ALTER TABLE "doctors" DROP CONSTRAINT IF EXISTS "${c}"`);
    }
    for (const name of [
      'verification_reference', 'verification_method', 'verified_by', 'verified_at', 'verification_status',
      'profile_source_permission', 'profile_source_retrieved_at', 'profile_source_url', 'profile_source',
      'photo_attribution', 'address', 'experience_source', 'career_start_year', 'registration_year',
      'registration_number', 'registration_council',
    ]) {
      await q.query(`ALTER TABLE "doctors" DROP COLUMN IF EXISTS "${name}"`);
    }
    // consultation_fee / experience_years stay nullable: restoring NOT NULL could fail on imported rows.
  }
}
