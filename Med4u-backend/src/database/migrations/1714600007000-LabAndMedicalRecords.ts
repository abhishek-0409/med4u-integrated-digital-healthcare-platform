import { MigrationInterface, QueryRunner } from 'typeorm';

/** Additive schema for demo lab availability and owner-scoped patient documents. */
export class LabAndMedicalRecords1714600007000 implements MigrationInterface {
  name = 'LabAndMedicalRecords1714600007000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "lab_tests" ADD COLUMN IF NOT EXISTS "sample_type" varchar(80) NOT NULL DEFAULT 'Not specified'`,
    );
    await q.query(
      `ALTER TABLE "lab_tests" ADD COLUMN IF NOT EXISTS "preparation_instructions" text NOT NULL DEFAULT 'No instructions provided.'`,
    );
    await q.query(
      `ALTER TABLE "lab_tests" ADD COLUMN IF NOT EXISTS "home_collection_available" boolean NOT NULL DEFAULT false`,
    );
    await q.query(
      `ALTER TABLE "lab_tests" ADD COLUMN IF NOT EXISTS "lab_location" varchar(160) NOT NULL DEFAULT 'Demo service only'`,
    );
    await q.query(
      `ALTER TABLE "lab_tests" ADD COLUMN IF NOT EXISTS "is_demo" boolean NOT NULL DEFAULT false`,
    );
    await q.query(
      `ALTER TABLE "lab_tests" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true`,
    );
    await q.query(
      `ALTER TABLE "lab_bookings" ADD COLUMN IF NOT EXISTS "preferred_time" varchar(5) NOT NULL DEFAULT '09:00'`,
    );
    await q.query(
      `ALTER TABLE "lab_bookings" ADD COLUMN IF NOT EXISTS "price_snapshot" numeric(10,2) NOT NULL DEFAULT 0`,
    );
    await q.query(
      `ALTER TABLE "lab_bookings" ADD COLUMN IF NOT EXISTS "contact_name" varchar(100)`,
    );
    await q.query(
      `ALTER TABLE "lab_bookings" ADD COLUMN IF NOT EXISTS "contact_phone" varchar(20)`,
    );
    await q.query(
      `ALTER TABLE "lab_bookings" ADD COLUMN IF NOT EXISTS "booking_source" varchar(16) NOT NULL DEFAULT 'legacy'`,
    );
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_lab_bookings_patient_slot" ON "lab_bookings" ("user_id", "preferred_date", "preferred_time") WHERE "status" <> 'cancelled' AND "booking_source" = 'app'`,
    );
    await q.query(`
      CREATE TABLE "medical_reports" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        "patient_id" uuid NOT NULL,
        "uploaded_by" uuid NOT NULL,
        "name" varchar(120) NOT NULL,
        "category" varchar(80) NOT NULL,
        "storage_key" varchar(64) NOT NULL UNIQUE,
        "mime_type" varchar(50) NOT NULL,
        "size_bytes" integer NOT NULL CHECK ("size_bytes" > 0),
        "sha256" char(64) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'uploaded' CHECK ("status" IN ('uploaded')),
        CONSTRAINT "PK_medical_reports" PRIMARY KEY ("id"),
        CONSTRAINT "FK_medical_reports_patient" FOREIGN KEY ("patient_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_medical_reports_uploader" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await q.query(
      `CREATE INDEX "IDX_medical_reports_patient_created" ON "medical_reports" ("patient_id", "created_at" DESC)`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "medical_reports"`);
    await q.query(`DROP INDEX IF EXISTS "UQ_lab_bookings_patient_slot"`);
    for (const col of [
      'booking_source',
      'contact_phone',
      'contact_name',
      'price_snapshot',
      'preferred_time',
    ])
      await q.query(`ALTER TABLE "lab_bookings" DROP COLUMN IF EXISTS "${col}"`);
    for (const col of [
      'is_active',
      'is_demo',
      'lab_location',
      'home_collection_available',
      'preparation_instructions',
      'sample_type',
    ])
      await q.query(`ALTER TABLE "lab_tests" DROP COLUMN IF EXISTS "${col}"`);
  }
}
