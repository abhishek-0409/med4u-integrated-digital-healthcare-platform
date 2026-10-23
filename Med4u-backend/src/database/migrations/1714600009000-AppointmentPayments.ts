import { MigrationInterface, QueryRunner } from 'typeorm';

/** Additive payment state for appointments; legacy bookings remain explicitly payment-not-required. */
export class AppointmentPayments1714600009000 implements MigrationInterface {
  name = 'AppointmentPayments1714600009000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "appointments"
        ADD COLUMN IF NOT EXISTS "payment_status" varchar(20) NOT NULL DEFAULT 'NOT_REQUIRED',
        ADD COLUMN IF NOT EXISTS "razorpay_order_id" varchar(64),
        ADD COLUMN IF NOT EXISTS "razorpay_payment_id" varchar(64),
        ADD COLUMN IF NOT EXISTS "payment_expires_at" timestamptz
    `);
    await queryRunner.query(`
      ALTER TABLE "appointments"
        ADD CONSTRAINT "CHK_appointments_payment_status"
        CHECK ("payment_status" IN ('NOT_REQUIRED', 'PENDING', 'PAID', 'FAILED', 'EXPIRED'))
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_appointments_razorpay_order"
      ON "appointments" ("razorpay_order_id") WHERE "razorpay_order_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_appointments_razorpay_payment"
      ON "appointments" ("razorpay_payment_id") WHERE "razorpay_payment_id" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_appointments_razorpay_payment"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_appointments_razorpay_order"`);
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "CHK_appointments_payment_status"`,
    );
    await queryRunner.query(`
      ALTER TABLE "appointments"
        DROP COLUMN IF EXISTS "payment_expires_at",
        DROP COLUMN IF EXISTS "razorpay_payment_id",
        DROP COLUMN IF EXISTS "razorpay_order_id",
        DROP COLUMN IF EXISTS "payment_status"
    `);
  }
}
