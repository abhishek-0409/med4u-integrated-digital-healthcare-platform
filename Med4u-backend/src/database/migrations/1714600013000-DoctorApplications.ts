import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Doctor registration and verification workflow. Purely additive: no existing table or row is touched.
 *
 * Integrity is enforced in the database as well as in code:
 *  - the review deadline is exactly submitted_at + 24 hours;
 *  - a decided application always names a reviewer, and a reviewer can never be the applicant;
 *  - an APPROVED application points at the doctors row it produced;
 *  - the same (council, registration number) cannot be pending or approved twice;
 *  - the audit trail rejects UPDATE and DELETE.
 */
export class DoctorApplications1714600013000 implements MigrationInterface {
  name = 'DoctorApplications1714600013000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "doctor_applications" (
        "id"                  UUID         NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "deleted_at"          TIMESTAMPTZ,
        "user_id"             UUID         NOT NULL,
        "status"              VARCHAR(24)  NOT NULL DEFAULT 'PENDING_VERIFICATION',
        "full_name"           VARCHAR(100) NOT NULL,
        "email"               VARCHAR(150) NOT NULL,
        "registration_number" VARCHAR(50)  NOT NULL,
        "registration_council" VARCHAR(120) NOT NULL,
        "qualification"       VARCHAR(100) NOT NULL,
        "medical_college"     VARCHAR(150) NOT NULL,
        "specialization"      VARCHAR(100) NOT NULL,
        "clinic_name"         VARCHAR(150) NOT NULL,
        "clinic_address"      VARCHAR(300) NOT NULL,
        "city"                VARCHAR(100) NOT NULL,
        "consultation_mode"   VARCHAR(10)  NOT NULL,
        "submitted_at"        TIMESTAMPTZ  NOT NULL,
        "review_deadline_at"  TIMESTAMPTZ  NOT NULL,
        "resubmission_count"  INT          NOT NULL DEFAULT 0,
        "resubmission_allowed" BOOLEAN     NOT NULL DEFAULT false,
        "reviewer_id"         UUID,
        "decided_at"          TIMESTAMPTZ,
        "reviewer_notes"      TEXT,
        "applicant_message"   TEXT,
        "registry_check"      VARCHAR(40),
        "registry_source"     VARCHAR(200),
        "registry_reference"  VARCHAR(200),
        "doctor_id"           UUID,
        CONSTRAINT "PK_doctor_applications" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_doctor_applications_user" UNIQUE ("user_id"),
        CONSTRAINT "FK_doctor_applications_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_doctor_applications_reviewer" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_doctor_applications_doctor" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_doctor_applications_status" CHECK ("status" IN
          ('PENDING_VERIFICATION','UNDER_REVIEW','NEEDS_INFO','APPROVED','REJECTED')),
        CONSTRAINT "CHK_doctor_applications_mode" CHECK ("consultation_mode" IN ('ONLINE','OFFLINE','BOTH')),
        CONSTRAINT "CHK_doctor_applications_deadline" CHECK ("review_deadline_at" = "submitted_at" + interval '24 hours'),
        CONSTRAINT "CHK_doctor_applications_registry" CHECK ("registry_check" IS NULL OR "registry_check" IN
          ('VERIFIED_AGAINST_OFFICIAL_REGISTER','REGISTER_UNAVAILABLE')),
        CONSTRAINT "CHK_doctor_applications_no_self_review" CHECK ("reviewer_id" IS NULL OR "reviewer_id" <> "user_id"),
        CONSTRAINT "CHK_doctor_applications_decision" CHECK (
          CASE "status"
            WHEN 'PENDING_VERIFICATION' THEN "doctor_id" IS NULL
            WHEN 'UNDER_REVIEW' THEN "reviewer_id" IS NOT NULL AND "doctor_id" IS NULL
            WHEN 'NEEDS_INFO' THEN "reviewer_id" IS NOT NULL AND "decided_at" IS NOT NULL
              AND "applicant_message" IS NOT NULL AND "doctor_id" IS NULL
            WHEN 'REJECTED' THEN "reviewer_id" IS NOT NULL AND "decided_at" IS NOT NULL
              AND "applicant_message" IS NOT NULL AND "doctor_id" IS NULL
            WHEN 'APPROVED' THEN "reviewer_id" IS NOT NULL AND "decided_at" IS NOT NULL
              AND "doctor_id" IS NOT NULL AND "registry_check" IS NOT NULL
            ELSE false
          END)
      )
    `);
    await q.query(`CREATE INDEX "IDX_doctor_applications_queue" ON "doctor_applications" ("status", "review_deadline_at")`);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_doctor_applications_registration"
         ON "doctor_applications" (lower("registration_council"), upper("registration_number"))
         WHERE "status" <> 'REJECTED' AND "deleted_at" IS NULL`,
    );

    await q.query(`
      CREATE TABLE "doctor_application_documents" (
        "id"             UUID         NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"     TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "deleted_at"     TIMESTAMPTZ,
        "application_id" UUID         NOT NULL,
        "kind"           VARCHAR(30)  NOT NULL,
        "storage_key"    VARCHAR(32)  NOT NULL,
        "original_name"  VARCHAR(120) NOT NULL,
        "mime_type"      VARCHAR(40)  NOT NULL,
        "size_bytes"     INT          NOT NULL,
        "sha256"         CHAR(64)     NOT NULL,
        "superseded_at"  TIMESTAMPTZ,
        "purged_at"      TIMESTAMPTZ,
        CONSTRAINT "PK_doctor_application_documents" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_doctor_application_documents_key" UNIQUE ("storage_key"),
        CONSTRAINT "FK_doctor_application_documents_app" FOREIGN KEY ("application_id")
          REFERENCES "doctor_applications"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_doctor_application_documents_kind" CHECK ("kind" IN
          ('GRADUATION_CERTIFICATE','REGISTRATION_CERTIFICATE')),
        CONSTRAINT "CHK_doctor_application_documents_mime" CHECK ("mime_type" IN
          ('image/jpeg','image/png','application/pdf'))
      )
    `);
    await q.query(`CREATE INDEX "IDX_doctor_application_documents_app" ON "doctor_application_documents" ("application_id")`);
    // Exactly one current file per document kind.
    await q.query(
      `CREATE UNIQUE INDEX "UQ_doctor_application_documents_current"
         ON "doctor_application_documents" ("application_id", "kind") WHERE "superseded_at" IS NULL`,
    );

    await q.query(`
      CREATE TABLE "doctor_application_events" (
        "id"                UUID         NOT NULL DEFAULT uuid_generate_v4(),
        "application_id"    UUID         NOT NULL,
        "actor_user_id"     UUID         NOT NULL,
        "actor_role"        VARCHAR(20)  NOT NULL,
        "action"            VARCHAR(24)  NOT NULL,
        "from_status"       VARCHAR(24),
        "to_status"         VARCHAR(24),
        "note"              TEXT,
        "applicant_message" TEXT,
        "metadata"          JSONB,
        "created_at"        TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_doctor_application_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_doctor_application_events_app" FOREIGN KEY ("application_id")
          REFERENCES "doctor_applications"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_doctor_application_events_actor" FOREIGN KEY ("actor_user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await q.query(
      `CREATE INDEX "IDX_doctor_application_events_app" ON "doctor_application_events" ("application_id", "created_at")`,
    );
    await q.query(`
      CREATE FUNCTION "doctor_application_events_immutable"() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'doctor_application_events is append-only';
      END;
      $$ LANGUAGE plpgsql
    `);
    await q.query(
      `CREATE TRIGGER "TRG_doctor_application_events_immutable"
         BEFORE UPDATE OR DELETE ON "doctor_application_events"
         FOR EACH ROW EXECUTE FUNCTION "doctor_application_events_immutable"()`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TRIGGER IF EXISTS "TRG_doctor_application_events_immutable" ON "doctor_application_events"`);
    await q.query(`DROP FUNCTION IF EXISTS "doctor_application_events_immutable"()`);
    await q.query(`DROP TABLE IF EXISTS "doctor_application_events"`);
    await q.query(`DROP TABLE IF EXISTS "doctor_application_documents"`);
    await q.query(`DROP TABLE IF EXISTS "doctor_applications"`);
  }
}
