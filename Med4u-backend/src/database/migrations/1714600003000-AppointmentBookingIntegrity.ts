import { MigrationInterface, QueryRunner } from 'typeorm';

const LEGACY_NOTE = 'Duplicate booking cancelled by migration';

/**
 * Database-level double-booking protection.
 *
 * The original UNIQUE("slot_id") also blocked re-booking a slot after its appointment was
 * cancelled, so it is replaced by partial unique indexes that ignore cancelled/rescheduled rows.
 *
 * Databases that were populated by the old debug helpers can contain rows that violate the new
 * rules, so those are normalised first (nothing is deleted).
 */
export class AppointmentBookingIntegrity1714600003000 implements MigrationInterface {
  name = 'AppointmentBookingIntegrity1714600003000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. A patient can hold one live appointment per instant: keep the earliest, cancel the rest
    //    and release their slots.
    await queryRunner.query(
      `
      UPDATE "appointments" SET "status" = 'cancelled', "cancellation_reason" = $1
      WHERE "id" IN (
        SELECT "id" FROM (
          SELECT "id", ROW_NUMBER() OVER (
            PARTITION BY "patient_id", "appointment_date" ORDER BY "created_at", "id"
          ) AS rn
          FROM "appointments" WHERE "status" NOT IN ('cancelled', 'rescheduled')
        ) ranked WHERE rn > 1
      )`,
      [LEGACY_NOTE],
    );
    await queryRunner.query(
      `UPDATE "time_slots" SET "is_booked" = false
       WHERE "id" IN (SELECT "slot_id" FROM "appointments" WHERE "cancellation_reason" = $1)`,
      [LEGACY_NOTE],
    );

    // 2. Slots must be unique per doctor/date/start. Duplicates keep their rows (appointments
    //    reference them) and are nudged apart by a second each.
    await queryRunner.query(`
      UPDATE "time_slots" t SET "start_time" = t."start_time" + ((d.rn - 1) * INTERVAL '1 second')
      FROM (
        SELECT "id", ROW_NUMBER() OVER (
          PARTITION BY "doctor_id", "date", "start_time" ORDER BY "created_at", "id"
        ) AS rn
        FROM "time_slots" WHERE "deleted_at" IS NULL
      ) d
      WHERE t."id" = d."id" AND d.rn > 1
    `);

    await queryRunner.query(
      `ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "UQ_appointments_slot_id"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_appointments_active_slot" ON "appointments" ("slot_id")
      WHERE "status" NOT IN ('cancelled', 'rescheduled')
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_appointments_patient_active_time"
      ON "appointments" ("patient_id", "appointment_date")
      WHERE "status" NOT IN ('cancelled', 'rescheduled')
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_time_slots_doctor_date_start"
      ON "time_slots" ("doctor_id", "date", "start_time")
      WHERE "deleted_at" IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_time_slots_doctor_date_start"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_appointments_patient_active_time"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_appointments_active_slot"`);
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "UQ_appointments_slot_id" UNIQUE ("slot_id")`,
    );
  }
}
