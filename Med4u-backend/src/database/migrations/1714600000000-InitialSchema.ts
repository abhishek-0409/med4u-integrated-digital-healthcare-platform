import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1714600000000 implements MigrationInterface {
  name = 'InitialSchema1714600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Extensions ───────────────────────────────────────────────────────────
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`);

    // ── Enums ────────────────────────────────────────────────────────────────
    await queryRunner.query(
      `CREATE TYPE "users_gender_enum" AS ENUM ('male', 'female', 'other')`,
    );
    await queryRunner.query(
      `CREATE TYPE "users_blood_group_enum" AS ENUM ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')`,
    );
    await queryRunner.query(
      `CREATE TYPE "users_role_enum" AS ENUM ('patient', 'doctor', 'admin')`,
    );
    await queryRunner.query(
      `CREATE TYPE "appointments_type_enum" AS ENUM ('video', 'in_person')`,
    );
    await queryRunner.query(
      `CREATE TYPE "appointments_status_enum" AS ENUM ('pending', 'confirmed', 'cancelled', 'completed', 'rescheduled')`,
    );
    await queryRunner.query(
      `CREATE TYPE "prescriptions_file_type_enum" AS ENUM ('pdf', 'image')`,
    );
    await queryRunner.query(
      `CREATE TYPE "notifications_type_enum" AS ENUM ('appointment_reminder', 'prescription_ready', 'call_incoming', 'general')`,
    );
    await queryRunner.query(
      `CREATE TYPE "lab_bookings_status_enum" AS ENUM ('pending', 'confirmed', 'sample_collected', 'processing', 'completed', 'cancelled')`,
    );

    // ── users ────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"           UUID        NOT NULL DEFAULT uuid_generate_v4(),
        "phone"        VARCHAR(20) NOT NULL,
        "name"         VARCHAR(100) NOT NULL,
        "email"        VARCHAR(150),
        "avatar_url"   VARCHAR,
        "dob"          DATE,
        "gender"       "users_gender_enum",
        "blood_group"  "users_blood_group_enum",
        "role"         "users_role_enum" NOT NULL DEFAULT 'patient',
        "fcm_token"    VARCHAR,
        "is_active"    BOOLEAN NOT NULL DEFAULT TRUE,
        "is_verified"  BOOLEAN NOT NULL DEFAULT FALSE,
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at"   TIMESTAMPTZ,
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_phone" UNIQUE ("phone"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_users_phone"   ON "users" ("phone")`);
    await queryRunner.query(`CREATE INDEX "IDX_users_email"   ON "users" ("email")`);
    await queryRunner.query(`CREATE INDEX "IDX_users_role"    ON "users" ("role")`);

    // ── doctors ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "doctors" (
        "id"                     UUID           NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"                UUID           NOT NULL,
        "specialization"         VARCHAR(100)   NOT NULL,
        "license_number"         VARCHAR(50)    NOT NULL,
        "experience_years"       INT            NOT NULL DEFAULT 0,
        "bio"                    TEXT,
        "consultation_fee"       DECIMAL(10,2)  NOT NULL DEFAULT 0,
        "languages"              TEXT           NOT NULL DEFAULT '',
        "education"              JSONB          NOT NULL DEFAULT '[]',
        "rating"                 DECIMAL(3,2)   NOT NULL DEFAULT 0,
        "review_count"           INT            NOT NULL DEFAULT 0,
        "is_verified"            BOOLEAN        NOT NULL DEFAULT FALSE,
        "availability_schedule"  JSONB          NOT NULL DEFAULT '{}',
        "created_at"             TIMESTAMPTZ    NOT NULL DEFAULT now(),
        "updated_at"             TIMESTAMPTZ    NOT NULL DEFAULT now(),
        "deleted_at"             TIMESTAMPTZ,
        CONSTRAINT "PK_doctors" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_doctors_user_id"        UNIQUE ("user_id"),
        CONSTRAINT "UQ_doctors_license_number" UNIQUE ("license_number"),
        CONSTRAINT "FK_doctors_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_doctors_user_id"       ON "doctors" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_doctors_specialization" ON "doctors" ("specialization")`);
    await queryRunner.query(`CREATE INDEX "IDX_doctors_rating"         ON "doctors" ("rating")`);

    // ── time_slots ───────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "time_slots" (
        "id"          UUID      NOT NULL DEFAULT uuid_generate_v4(),
        "doctor_id"   UUID      NOT NULL,
        "date"        DATE      NOT NULL,
        "start_time"  TIME      NOT NULL,
        "end_time"    TIME      NOT NULL,
        "is_booked"   BOOLEAN   NOT NULL DEFAULT FALSE,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at"  TIMESTAMPTZ,
        CONSTRAINT "PK_time_slots" PRIMARY KEY ("id"),
        CONSTRAINT "FK_time_slots_doctor_id" FOREIGN KEY ("doctor_id")
          REFERENCES "doctors" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_time_slots_doctor_date"     ON "time_slots" ("doctor_id", "date")`);
    await queryRunner.query(`CREATE INDEX "IDX_time_slots_doctor_is_booked" ON "time_slots" ("doctor_id", "is_booked")`);

    // ── appointments ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "appointments" (
        "id"                  UUID      NOT NULL DEFAULT uuid_generate_v4(),
        "patient_id"          UUID      NOT NULL,
        "doctor_id"           UUID      NOT NULL,
        "slot_id"             UUID      NOT NULL,
        "appointment_date"    TIMESTAMPTZ NOT NULL,
        "type"                "appointments_type_enum"   NOT NULL DEFAULT 'video',
        "status"              "appointments_status_enum" NOT NULL DEFAULT 'pending',
        "notes"               TEXT,
        "cancellation_reason" TEXT,
        "rescheduled_from"    UUID,
        "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at"          TIMESTAMPTZ,
        CONSTRAINT "PK_appointments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_appointments_slot_id" UNIQUE ("slot_id"),
        CONSTRAINT "FK_appointments_patient_id" FOREIGN KEY ("patient_id")
          REFERENCES "users" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_appointments_doctor_id" FOREIGN KEY ("doctor_id")
          REFERENCES "doctors" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_appointments_slot_id" FOREIGN KEY ("slot_id")
          REFERENCES "time_slots" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_appointments_rescheduled_from" FOREIGN KEY ("rescheduled_from")
          REFERENCES "appointments" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_appointments_patient_id"   ON "appointments" ("patient_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_appointments_doctor_id"    ON "appointments" ("doctor_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_appointments_date"         ON "appointments" ("appointment_date")`);
    await queryRunner.query(`CREATE INDEX "IDX_appointments_status"       ON "appointments" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_appointments_doctor_date"  ON "appointments" ("doctor_id", "appointment_date")`);

    // ── prescriptions ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "prescriptions" (
        "id"             UUID      NOT NULL DEFAULT uuid_generate_v4(),
        "appointment_id" UUID      NOT NULL,
        "doctor_id"      UUID      NOT NULL,
        "patient_id"     UUID      NOT NULL,
        "file_url"       VARCHAR   NOT NULL,
        "file_type"      "prescriptions_file_type_enum" NOT NULL DEFAULT 'pdf',
        "public_id"      VARCHAR,
        "notes"          TEXT,
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at"     TIMESTAMPTZ,
        CONSTRAINT "PK_prescriptions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_prescriptions_appointment_id" UNIQUE ("appointment_id"),
        CONSTRAINT "FK_prescriptions_appointment_id" FOREIGN KEY ("appointment_id")
          REFERENCES "appointments" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_prescriptions_doctor_id" FOREIGN KEY ("doctor_id")
          REFERENCES "doctors" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_prescriptions_patient_id" FOREIGN KEY ("patient_id")
          REFERENCES "users" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_prescriptions_doctor_id"  ON "prescriptions" ("doctor_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_prescriptions_patient_id" ON "prescriptions" ("patient_id")`);

    // ── otp_codes ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "otp_codes" (
        "id"             UUID        NOT NULL DEFAULT uuid_generate_v4(),
        "phone"          VARCHAR(20) NOT NULL,
        "code"           VARCHAR(255) NOT NULL,
        "expires_at"     TIMESTAMPTZ NOT NULL,
        "is_used"        BOOLEAN     NOT NULL DEFAULT FALSE,
        "attempt_count"  INT         NOT NULL DEFAULT 0,
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_otp_codes" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_otp_codes_phone"          ON "otp_codes" ("phone")`);
    await queryRunner.query(`CREATE INDEX "IDX_otp_codes_phone_is_used"  ON "otp_codes" ("phone", "is_used")`);

    // ── sessions ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "sessions" (
        "id"            UUID      NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"       UUID      NOT NULL,
        "refresh_token" VARCHAR(512) NOT NULL,
        "expires_at"    TIMESTAMPTZ NOT NULL,
        "ip_address"    VARCHAR(45),
        "user_agent"    TEXT,
        "is_revoked"    BOOLEAN   NOT NULL DEFAULT FALSE,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sessions_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_sessions_user_id"           ON "sessions" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_sessions_user_is_revoked"   ON "sessions" ("user_id", "is_revoked")`);

    // ── reviews ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "reviews" (
        "id"             UUID NOT NULL DEFAULT uuid_generate_v4(),
        "doctor_id"      UUID NOT NULL,
        "patient_id"     UUID NOT NULL,
        "appointment_id" UUID NOT NULL,
        "rating"         INT  NOT NULL,
        "comment"        TEXT,
        "is_visible"     BOOLEAN NOT NULL DEFAULT TRUE,
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at"     TIMESTAMPTZ,
        CONSTRAINT "PK_reviews" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_reviews_appointment_id" UNIQUE ("appointment_id"),
        CONSTRAINT "CHK_reviews_rating" CHECK (rating >= 1 AND rating <= 5),
        CONSTRAINT "FK_reviews_doctor_id" FOREIGN KEY ("doctor_id")
          REFERENCES "doctors" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_reviews_patient_id" FOREIGN KEY ("patient_id")
          REFERENCES "users" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_reviews_appointment_id" FOREIGN KEY ("appointment_id")
          REFERENCES "appointments" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_reviews_doctor_id"      ON "reviews" ("doctor_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_reviews_patient_id"     ON "reviews" ("patient_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_reviews_doctor_rating"  ON "reviews" ("doctor_id", "rating")`);

    // ── notifications ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id"         UUID      NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"    UUID      NOT NULL,
        "type"       "notifications_type_enum" NOT NULL DEFAULT 'general',
        "title"      VARCHAR(255) NOT NULL,
        "body"       TEXT         NOT NULL,
        "data"       JSONB,
        "is_read"    BOOLEAN   NOT NULL DEFAULT FALSE,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notifications_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_notifications_user_id"       ON "notifications" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_notifications_user_is_read"  ON "notifications" ("user_id", "is_read")`);
    await queryRunner.query(`CREATE INDEX "IDX_notifications_user_type"     ON "notifications" ("user_id", "type")`);

    // ── lab_tests ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "lab_tests" (
        "id"               UUID           NOT NULL DEFAULT uuid_generate_v4(),
        "name"             VARCHAR(150)   NOT NULL,
        "category"         VARCHAR(100)   NOT NULL,
        "description"      TEXT,
        "price"            DECIMAL(10,2)  NOT NULL,
        "turnaround_days"  INT            NOT NULL,
        "created_at"       TIMESTAMPTZ    NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMPTZ    NOT NULL DEFAULT now(),
        "deleted_at"       TIMESTAMPTZ,
        CONSTRAINT "PK_lab_tests" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_lab_tests_category" ON "lab_tests" ("category")`);

    // ── lab_bookings ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "lab_bookings" (
        "id"              UUID      NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"         UUID      NOT NULL,
        "test_id"         UUID      NOT NULL,
        "preferred_date"  DATE      NOT NULL,
        "address"         JSONB,
        "home_collection" BOOLEAN   NOT NULL DEFAULT FALSE,
        "status"          "lab_bookings_status_enum" NOT NULL DEFAULT 'pending',
        "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at"      TIMESTAMPTZ,
        CONSTRAINT "PK_lab_bookings" PRIMARY KEY ("id"),
        CONSTRAINT "FK_lab_bookings_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_lab_bookings_test_id" FOREIGN KEY ("test_id")
          REFERENCES "lab_tests" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_lab_bookings_user_id"     ON "lab_bookings" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_lab_bookings_test_id"     ON "lab_bookings" ("test_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_lab_bookings_status"      ON "lab_bookings" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_lab_bookings_user_status" ON "lab_bookings" ("user_id", "status")`);

    // ── medicines ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "medicines" (
        "id"                      UUID           NOT NULL DEFAULT uuid_generate_v4(),
        "name"                    VARCHAR(200)   NOT NULL,
        "generic_name"            VARCHAR(200),
        "manufacturer"            VARCHAR(150),
        "category"                VARCHAR(100)   NOT NULL,
        "description"             TEXT,
        "requires_prescription"   BOOLEAN        NOT NULL DEFAULT FALSE,
        "created_at"              TIMESTAMPTZ    NOT NULL DEFAULT now(),
        "updated_at"              TIMESTAMPTZ    NOT NULL DEFAULT now(),
        "deleted_at"              TIMESTAMPTZ,
        CONSTRAINT "PK_medicines" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_medicines_category" ON "medicines" ("category")`);
    await queryRunner.query(`CREATE INDEX "IDX_medicines_name"     ON "medicines" ("name")`);

    // ── Trigram indexes for full-text-style search ────────────────────────────
    await queryRunner.query(`CREATE INDEX "IDX_users_name_trgm"    ON "users"    USING gin ("name" gin_trgm_ops)`);
    await queryRunner.query(`CREATE INDEX "IDX_doctors_spec_trgm"  ON "doctors"  USING gin ("specialization" gin_trgm_ops)`);
    await queryRunner.query(`CREATE INDEX "IDX_medicines_name_trgm" ON "medicines" USING gin ("name" gin_trgm_ops)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "medicines"     CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "lab_bookings"  CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "lab_tests"     CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reviews"       CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sessions"      CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "otp_codes"     CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "prescriptions" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "appointments"  CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "time_slots"    CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "doctors"       CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"         CASCADE`);

    await queryRunner.query(`DROP TYPE IF EXISTS "lab_bookings_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "notifications_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "prescriptions_file_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "appointments_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "appointments_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_role_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_blood_group_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_gender_enum"`);
  }
}
