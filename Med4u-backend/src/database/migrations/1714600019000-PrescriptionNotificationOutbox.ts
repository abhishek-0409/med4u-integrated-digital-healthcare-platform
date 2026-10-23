import { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds the patient-facing prescription notification type and durable issuance outbox. */
export class PrescriptionNotificationOutbox1714600019000 implements MigrationInterface {
  name = 'PrescriptionNotificationOutbox1714600019000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'prescription_issued'`);
    await q.query(`
      CREATE TABLE "notification_outbox" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        "event_key" varchar(160) NOT NULL,
        "user_id" uuid NOT NULL,
        "type" varchar(80) NOT NULL,
        "title" varchar(255) NOT NULL,
        "body" text NOT NULL,
        "data" jsonb,
        "attempts" integer NOT NULL DEFAULT 0,
        "delivered_at" timestamptz,
        CONSTRAINT "PK_notification_outbox" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_notification_outbox_event_key" UNIQUE ("event_key"),
        CONSTRAINT "FK_notification_outbox_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "IDX_notification_outbox_pending" ON "notification_outbox" ("delivered_at", "created_at")`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "notification_outbox"`);
    // PostgreSQL does not support removing one enum value in place. Keep the now-unused value on rollback.
  }
}
