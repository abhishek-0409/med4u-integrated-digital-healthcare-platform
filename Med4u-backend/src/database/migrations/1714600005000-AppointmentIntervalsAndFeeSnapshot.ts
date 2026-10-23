import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Protects the complete duration of a doctor's appointment and snapshots each appointment's fee
 * so future profile edits cannot rewrite booking history. A trigger is used instead of a static
 * exclusion constraint so existing historical overlaps remain untouched and readable.
 */
export class AppointmentIntervalsAndFeeSnapshot1714600005000 implements MigrationInterface {
  name = 'AppointmentIntervalsAndFeeSnapshot1714600005000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "appointments"
      ADD COLUMN IF NOT EXISTS "consultation_fee" numeric(10,2)
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_overlapping_doctor_appointments()
      RETURNS trigger AS $$
      DECLARE
        target_slot "time_slots"%ROWTYPE;
      BEGIN
        IF NEW."status" NOT IN ('pending', 'confirmed') THEN
          RETURN NEW;
        END IF;

        -- Serialize appointments for this doctor before checking intervals. Hash collisions only
        -- cause harmless extra serialization; the lock is transaction-scoped.
        PERFORM pg_advisory_xact_lock(hashtextextended(NEW."doctor_id"::text, 0));

        SELECT * INTO target_slot FROM "time_slots" WHERE "id" = NEW."slot_id";
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Appointment slot does not exist';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM "appointments" a
          JOIN "time_slots" occupied ON occupied."id" = a."slot_id"
          WHERE a."id" <> NEW."id"
            AND a."doctor_id" = NEW."doctor_id"
            AND a."status" IN ('pending', 'confirmed')
            AND tsrange(occupied."date" + occupied."start_time", occupied."date" + occupied."end_time", '[)')
                && tsrange(target_slot."date" + target_slot."start_time", target_slot."date" + target_slot."end_time", '[)')
        ) THEN
          RAISE EXCEPTION USING
            ERRCODE = '23P01',
            CONSTRAINT = 'EX_appointments_doctor_interval',
            MESSAGE = 'The doctor already has an overlapping appointment';
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TR_appointments_doctor_interval"
      BEFORE INSERT OR UPDATE OF "doctor_id", "slot_id", "status" ON "appointments"
      FOR EACH ROW EXECUTE FUNCTION prevent_overlapping_doctor_appointments()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TR_appointments_doctor_interval" ON "appointments"`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS prevent_overlapping_doctor_appointments()`);
    await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN IF EXISTS "consultation_fee"`);
    // btree_gist may be used by other application constraints, so leave the extension installed.
  }
}
