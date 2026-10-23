import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Structured doctor-issued prescriptions plus an append-only audit trail.
 *
 * Additive only: the legacy file-based `prescriptions` table and `prescription_uploads` are not touched, and no
 * existing row is read or modified. Integrity rules live in the database as well as in the service:
 *  - at most one open draft and at most one issued prescription per appointment;
 *  - an issued prescription's clinical content can never change, it can only move to superseded/cancelled;
 *  - non-draft rows cannot be deleted; audit events cannot be updated or deleted.
 */
export class ClinicalPrescriptions1714600014000 implements MigrationInterface {
  name = 'ClinicalPrescriptions1714600014000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TYPE "clinical_prescription_status_enum" AS ENUM ('draft', 'issued', 'superseded', 'cancelled')`,
    );
    await q.query(`
      CREATE TABLE "clinical_prescriptions" (
        "id"                      uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"              timestamptz NOT NULL DEFAULT now(),
        "updated_at"              timestamptz NOT NULL DEFAULT now(),
        "deleted_at"              timestamptz,
        "appointment_id"          uuid        NOT NULL,
        "doctor_id"               uuid        NOT NULL,
        "patient_id"              uuid        NOT NULL,
        "status"                  "clinical_prescription_status_enum" NOT NULL DEFAULT 'draft',
        "version"                 integer     NOT NULL DEFAULT 1,
        "revision"                integer     NOT NULL DEFAULT 1,
        "diagnosis"               text,
        "medicines"               jsonb       NOT NULL DEFAULT '[]',
        "additional_instructions" text,
        "warnings"                text,
        "follow_up_date"          date,
        "issued_at"               timestamptz,
        "issued_by"               uuid,
        "content_hash"            char(64),
        "doctor_snapshot"         jsonb,
        "supersedes_id"           uuid,
        "superseded_by_id"        uuid,
        "amendment_reason"        varchar(300),
        "cancelled_at"            timestamptz,
        "cancellation_reason"     varchar(300),
        CONSTRAINT "PK_clinical_prescriptions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_clinical_prescriptions_appointment" FOREIGN KEY ("appointment_id")
          REFERENCES "appointments"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_clinical_prescriptions_doctor" FOREIGN KEY ("doctor_id")
          REFERENCES "doctors"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_clinical_prescriptions_patient" FOREIGN KEY ("patient_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_clinical_prescriptions_supersedes" FOREIGN KEY ("supersedes_id")
          REFERENCES "clinical_prescriptions"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_clinical_prescriptions_superseded_by" FOREIGN KEY ("superseded_by_id")
          REFERENCES "clinical_prescriptions"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_clinical_prescriptions_issue_fields" CHECK (
          "status" = 'draft' OR ("issued_at" IS NOT NULL AND "issued_by" IS NOT NULL AND "content_hash" IS NOT NULL
                                 AND "doctor_snapshot" IS NOT NULL)
        )
      )
    `);
    await q.query(
      `CREATE INDEX "IDX_clinical_prescriptions_patient_status" ON "clinical_prescriptions" ("patient_id", "status")`,
    );
    await q.query(
      `CREATE INDEX "IDX_clinical_prescriptions_doctor" ON "clinical_prescriptions" ("doctor_id")`,
    );
    await q.query(
      `CREATE INDEX "IDX_clinical_prescriptions_appointment" ON "clinical_prescriptions" ("appointment_id")`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "UQ_clinical_prescriptions_open_draft" ON "clinical_prescriptions" ("appointment_id")
         WHERE "status" = 'draft' AND "deleted_at" IS NULL`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "UQ_clinical_prescriptions_one_issued" ON "clinical_prescriptions" ("appointment_id")
         WHERE "status" = 'issued'`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "UQ_clinical_prescriptions_supersedes" ON "clinical_prescriptions" ("supersedes_id")
         WHERE "supersedes_id" IS NOT NULL AND "deleted_at" IS NULL`,
    );

    await q.query(`
      CREATE FUNCTION clinical_prescriptions_guard() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'An issued prescription cannot be deleted' USING ERRCODE = 'integrity_constraint_violation';
          END IF;
          RETURN OLD;
        END IF;
        IF OLD.status <> 'draft' THEN
          IF (NEW.appointment_id, NEW.doctor_id, NEW.patient_id, NEW.diagnosis, NEW.medicines,
              NEW.additional_instructions, NEW.warnings, NEW.follow_up_date, NEW.issued_at, NEW.issued_by,
              NEW.content_hash, NEW.doctor_snapshot, NEW.version, NEW.revision, NEW.supersedes_id,
              NEW.amendment_reason, NEW.deleted_at)
             IS DISTINCT FROM
             (OLD.appointment_id, OLD.doctor_id, OLD.patient_id, OLD.diagnosis, OLD.medicines,
              OLD.additional_instructions, OLD.warnings, OLD.follow_up_date, OLD.issued_at, OLD.issued_by,
              OLD.content_hash, OLD.doctor_snapshot, OLD.version, OLD.revision, OLD.supersedes_id,
              OLD.amendment_reason, OLD.deleted_at) THEN
            RAISE EXCEPTION 'An issued prescription cannot be modified; create an amendment instead'
              USING ERRCODE = 'integrity_constraint_violation';
          END IF;
          IF NEW.status <> OLD.status AND NOT (OLD.status = 'issued' AND NEW.status IN ('superseded', 'cancelled')) THEN
            RAISE EXCEPTION 'Invalid prescription status change from % to %', OLD.status, NEW.status
              USING ERRCODE = 'integrity_constraint_violation';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await q.query(`
      CREATE TRIGGER "TRG_clinical_prescriptions_guard"
      BEFORE UPDATE OR DELETE ON "clinical_prescriptions"
      FOR EACH ROW EXECUTE FUNCTION clinical_prescriptions_guard()
    `);

    await q.query(`
      CREATE TABLE "clinical_prescription_events" (
        "id"              uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "prescription_id" uuid        NOT NULL,
        "appointment_id"  uuid        NOT NULL,
        "actor_user_id"   uuid        NOT NULL,
        "action"          varchar(40) NOT NULL,
        "from_status"     varchar(20),
        "to_status"       varchar(20),
        "metadata"        jsonb,
        "created_at"      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_clinical_prescription_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_clinical_prescription_events_prescription" FOREIGN KEY ("prescription_id")
          REFERENCES "clinical_prescriptions"("id") ON DELETE RESTRICT
      )
    `);
    await q.query(
      `CREATE INDEX "IDX_clinical_prescription_events_prescription" ON "clinical_prescription_events" ("prescription_id", "created_at")`,
    );
    await q.query(`
      CREATE FUNCTION clinical_prescription_events_append_only() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'Prescription audit events are append-only' USING ERRCODE = 'integrity_constraint_violation';
      END;
      $$ LANGUAGE plpgsql
    `);
    await q.query(`
      CREATE TRIGGER "TRG_clinical_prescription_events_append_only"
      BEFORE UPDATE OR DELETE ON "clinical_prescription_events"
      FOR EACH ROW EXECUTE FUNCTION clinical_prescription_events_append_only()
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `DROP TRIGGER IF EXISTS "TRG_clinical_prescription_events_append_only" ON "clinical_prescription_events"`,
    );
    await q.query(`DROP FUNCTION IF EXISTS clinical_prescription_events_append_only()`);
    await q.query(`DROP TABLE IF EXISTS "clinical_prescription_events"`);
    await q.query(
      `DROP TRIGGER IF EXISTS "TRG_clinical_prescriptions_guard" ON "clinical_prescriptions"`,
    );
    await q.query(`DROP FUNCTION IF EXISTS clinical_prescriptions_guard()`);
    await q.query(`DROP TABLE IF EXISTS "clinical_prescriptions"`);
    await q.query(`DROP TYPE IF EXISTS "clinical_prescription_status_enum"`);
  }
}
