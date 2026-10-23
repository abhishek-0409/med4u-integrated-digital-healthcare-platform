import { MigrationInterface, QueryRunner } from 'typeorm';

/** Stores one Expo push token per authenticated user/device; it does not alter existing account credentials. */
export class DevicePushTokens1714600015000 implements MigrationInterface {
  name = 'DevicePushTokens1714600015000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "device_push_tokens" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(), "user_id" uuid NOT NULL,
      "device_id" varchar(100) NOT NULL, "token" varchar(255) NOT NULL,
      CONSTRAINT "PK_device_push_tokens" PRIMARY KEY ("id"),
      CONSTRAINT "FK_device_push_tokens_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
      CONSTRAINT "UQ_device_push_tokens_user_device" UNIQUE ("user_id", "device_id"),
      CONSTRAINT "UQ_device_push_tokens_token" UNIQUE ("token"))`);
    await q.query(`CREATE INDEX "IDX_device_push_tokens_user" ON "device_push_tokens" ("user_id")`);
    await q.query(`CREATE TABLE "push_delivery_tickets" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(), "device_push_token_id" uuid NOT NULL,
      "ticket_id" varchar(100) NOT NULL,
      CONSTRAINT "PK_push_delivery_tickets" PRIMARY KEY ("id"),
      CONSTRAINT "FK_push_delivery_tickets_token" FOREIGN KEY ("device_push_token_id") REFERENCES "device_push_tokens"("id") ON DELETE CASCADE,
      CONSTRAINT "UQ_push_delivery_tickets_ticket" UNIQUE ("ticket_id"))`);
    await q.query(`CREATE INDEX "IDX_push_delivery_tickets_created_at" ON "push_delivery_tickets" ("created_at")`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "push_delivery_tickets"`);
    await q.query(`DROP TABLE IF EXISTS "device_push_tokens"`);
  }
}
