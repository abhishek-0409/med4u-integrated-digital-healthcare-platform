import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive pharmacy fulfilment schema:
 *  - users.role gains 'pharmacist'
 *  - orders gain the fulfilment states, structured delivery contact, payment status and a
 *    cancellation reason; order_events records every status change
 *  - prescription_uploads: patient-submitted prescriptions with a pharmacist review trail.
 *    (The older `prescriptions` table is doctor-issued and bound to an appointment, so it is not reused.)
 *
 * New enum values are added here but not referenced, which keeps this safe inside a transaction.
 */
export class PharmacyFulfilment1714600006000 implements MigrationInterface {
  name = 'PharmacyFulfilment1714600006000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "users_role_enum" ADD VALUE IF NOT EXISTS 'pharmacist'`);
    for (const status of ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED']) {
      await queryRunner.query(`ALTER TYPE "order_status_enum" ADD VALUE IF NOT EXISTS '${status}'`);
    }

    // ── Prescription uploads ───────────────────────────────────────────────
    await queryRunner.query(
      `CREATE TYPE "prescription_upload_status_enum" AS ENUM ('PENDING', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "prescription_rejection_reason_enum" AS ENUM ('ILLEGIBLE', 'EXPIRED', 'INCOMPLETE', 'MEDICINE_NOT_COVERED', 'NOT_A_PRESCRIPTION', 'OTHER')`,
    );
    await queryRunner.query(`
      CREATE TABLE "prescription_uploads" (
        "id"               uuid                                  NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"       TIMESTAMP WITH TIME ZONE              NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP WITH TIME ZONE              NOT NULL DEFAULT now(),
        "deleted_at"       TIMESTAMP WITH TIME ZONE,
        "patient_id"       uuid                                  NOT NULL,
        "storage_key"      character varying(64)                 NOT NULL,
        "mime_type"        character varying(50)                 NOT NULL,
        "size_bytes"       integer                               NOT NULL,
        "sha256"           character(64)                         NOT NULL,
        "status"           "prescription_upload_status_enum"     NOT NULL DEFAULT 'PENDING',
        "reviewed_by"      uuid,
        "reviewed_at"      TIMESTAMP WITH TIME ZONE,
        "rejection_reason" "prescription_rejection_reason_enum",
        "reviewer_note"    character varying(200),
        CONSTRAINT "PK_prescription_uploads" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_prescription_uploads_storage_key" UNIQUE ("storage_key"),
        CONSTRAINT "CHK_prescription_uploads_size" CHECK ("size_bytes" > 0),
        CONSTRAINT "CHK_prescription_uploads_review" CHECK (
          ("status" = 'PENDING' AND "reviewed_by" IS NULL AND "reviewed_at" IS NULL AND "rejection_reason" IS NULL)
          OR ("status" = 'APPROVED' AND "reviewed_by" IS NOT NULL AND "reviewed_at" IS NOT NULL AND "rejection_reason" IS NULL)
          OR ("status" = 'REJECTED' AND "reviewed_by" IS NOT NULL AND "reviewed_at" IS NOT NULL AND "rejection_reason" IS NOT NULL)
        ),
        CONSTRAINT "FK_prescription_uploads_patient" FOREIGN KEY ("patient_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_prescription_uploads_reviewer" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_prescription_uploads_patient" ON "prescription_uploads" ("patient_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_prescription_uploads_status" ON "prescription_uploads" ("status", "created_at")`,
    );

    // ── Orders ─────────────────────────────────────────────────────────────
    // orders.prescription_id used to point at the doctor-issued table; no order ever used it.
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "FK_orders_prescription_id"`,
    );
    await queryRunner.query(`UPDATE "orders" SET "prescription_id" = NULL`);
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_prescription_upload" FOREIGN KEY ("prescription_id") REFERENCES "prescription_uploads"("id") ON DELETE RESTRICT`,
    );
    // One live order per uploaded prescription. A cancelled order releases it.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_orders_active_prescription" ON "orders" ("prescription_id") WHERE "prescription_id" IS NOT NULL AND "status" <> 'CANCELLED'`,
    );

    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "delivery_name" character varying(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "delivery_phone" character varying(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "delivery_city" character varying(80)`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "delivery_pincode" character varying(6)`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "payment_status" character varying(20) NOT NULL DEFAULT 'UNPAID'`,
    );
    // Only UNPAID exists: no payment provider is integrated yet.
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "CHK_orders_payment_status" CHECK ("payment_status" IN ('UNPAID'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "cancellation_reason" character varying(200)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_orders_status_created" ON "orders" ("status", "created_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "order_events" (
        "id"          uuid                     NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "order_id"    uuid                     NOT NULL,
        "actor_id"    uuid,
        "actor_role"  character varying(20)    NOT NULL,
        "from_status" character varying(30),
        "to_status"   character varying(30)    NOT NULL,
        "note"        character varying(200),
        CONSTRAINT "PK_order_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_order_events_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_order_events_actor" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_order_events_order" ON "order_events" ("order_id", "created_at")`,
    );
    // Backfill a creation event for orders that existed before this migration.
    await queryRunner.query(`
      INSERT INTO "order_events" ("order_id", "actor_id", "actor_role", "from_status", "to_status", "created_at")
      SELECT "id", "user_id", 'patient', NULL, "status"::text, "created_at" FROM "orders"
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "order_events"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_status_created"`);
    for (const col of [
      'cancellation_reason',
      'payment_status',
      'delivery_pincode',
      'delivery_city',
      'delivery_phone',
      'delivery_name',
    ]) {
      await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "${col}"`);
    }
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_orders_active_prescription"`);
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "FK_orders_prescription_upload"`,
    );
    await queryRunner.query(`UPDATE "orders" SET "prescription_id" = NULL`);
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_prescription_id" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "prescription_uploads"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "prescription_rejection_reason_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "prescription_upload_status_enum"`);
    // Postgres cannot drop enum values: 'pharmacist' and the new order states remain (harmless).
  }
}
