import { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds catalog-linked lab recommendations without modifying existing prescription rows. */
export class PrescriptionRecommendations1714600017000 implements MigrationInterface {
  name = 'PrescriptionRecommendations1714600017000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "clinical_prescriptions" ADD COLUMN "recommended_tests" jsonb NOT NULL DEFAULT '[]'`);
    await q.query(`
      CREATE OR REPLACE FUNCTION clinical_prescriptions_guard() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'An issued prescription cannot be deleted' USING ERRCODE = 'integrity_constraint_violation';
          END IF;
          RETURN OLD;
        END IF;
        IF OLD.status <> 'draft' THEN
          IF (NEW.appointment_id, NEW.doctor_id, NEW.patient_id, NEW.diagnosis, NEW.medicines,
              NEW.recommended_tests, NEW.additional_instructions, NEW.warnings, NEW.follow_up_date,
              NEW.issued_at, NEW.issued_by, NEW.content_hash, NEW.doctor_snapshot, NEW.version,
              NEW.revision, NEW.supersedes_id, NEW.amendment_reason, NEW.deleted_at)
             IS DISTINCT FROM
             (OLD.appointment_id, OLD.doctor_id, OLD.patient_id, OLD.diagnosis, OLD.medicines,
              OLD.recommended_tests, OLD.additional_instructions, OLD.warnings, OLD.follow_up_date,
              OLD.issued_at, OLD.issued_by, OLD.content_hash, OLD.doctor_snapshot, OLD.version,
              OLD.revision, OLD.supersedes_id, OLD.amendment_reason, OLD.deleted_at) THEN
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
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE OR REPLACE FUNCTION clinical_prescriptions_guard() RETURNS trigger AS $$
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
    await q.query(`ALTER TABLE "clinical_prescriptions" DROP COLUMN "recommended_tests"`);
  }
}
