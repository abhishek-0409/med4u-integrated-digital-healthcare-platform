import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marks a doctor as a clearly fictional STAGING TEST FIXTURE.
 *
 * A fixture is deliberately NOT "verified": the constraint below forbids a fixture from being a demo profile,
 * from being verified, and from carrying a registration number, so fictional evidence can never be stored.
 * The application treats a fixture as bookable only when NODE_ENV=development and STAGING_FIXTURES_ENABLED=true
 * (see doctor-eligibility.ts); in every other environment it behaves like any unverified, hidden doctor.
 */
export class StagingFixtureFlag1714600012000 implements MigrationInterface {
  name = 'StagingFixtureFlag1714600012000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "is_staging_fixture" boolean NOT NULL DEFAULT false`);
    await q.query(
      `ALTER TABLE "doctors" ADD CONSTRAINT "CHK_doctors_staging_fixture_honest" CHECK (
        NOT "is_staging_fixture" OR (
          NOT "is_demo"
          AND NOT "is_verified"
          AND "verification_status" = 'unverified'
          AND "registration_number" IS NULL
          AND "registration_council" IS NULL
        )
      )`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "doctors" DROP CONSTRAINT IF EXISTS "CHK_doctors_staging_fixture_honest"`);
    await q.query(`ALTER TABLE "doctors" DROP COLUMN IF EXISTS "is_staging_fixture"`);
  }
}
