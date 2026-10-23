import { MigrationInterface, QueryRunner } from 'typeorm';

/** Aligns both push entities with BaseEntity's nullable soft-delete column. */
export class PushDeliverySoftDeletes1714600016000 implements MigrationInterface {
  name = 'PushDeliverySoftDeletes1714600016000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "device_push_tokens" ADD COLUMN "deleted_at" timestamptz`);
    await q.query(`ALTER TABLE "push_delivery_tickets" ADD COLUMN "deleted_at" timestamptz`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "push_delivery_tickets" DROP COLUMN "deleted_at"`);
    await q.query(`ALTER TABLE "device_push_tokens" DROP COLUMN "deleted_at"`);
  }
}
