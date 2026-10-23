import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive schema for the onboarding flow: "Unknown" blood group, "Prefer not to say" gender and the
 * optional height/weight fields. Existing rows and values are untouched.
 *
 * ALTER TYPE ... ADD VALUE is allowed inside a transaction on PostgreSQL 12+, as long as the new
 * value is not used in the same transaction (it is not).
 */
export class ProfileOnboarding1714600008000 implements MigrationInterface {
  name = 'ProfileOnboarding1714600008000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "users_blood_group_enum" ADD VALUE IF NOT EXISTS 'unknown'`);
    await q.query(`ALTER TYPE "users_gender_enum" ADD VALUE IF NOT EXISTS 'prefer_not_to_say'`);
    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "height_cm" numeric(5,1)`);
    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "weight_kg" numeric(5,1)`);
    await q.query(
      `ALTER TABLE "users" ADD CONSTRAINT "CHK_users_height_cm" CHECK ("height_cm" IS NULL OR ("height_cm" >= 30 AND "height_cm" <= 272))`,
    );
    await q.query(
      `ALTER TABLE "users" ADD CONSTRAINT "CHK_users_weight_kg" CHECK ("weight_kg" IS NULL OR ("weight_kg" >= 1 AND "weight_kg" <= 500))`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    // Enum values cannot be dropped safely in PostgreSQL; they are left in place (unused values are harmless).
    await q.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "CHK_users_weight_kg"`);
    await q.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "CHK_users_height_cm"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "weight_kg"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "height_cm"`);
  }
}
