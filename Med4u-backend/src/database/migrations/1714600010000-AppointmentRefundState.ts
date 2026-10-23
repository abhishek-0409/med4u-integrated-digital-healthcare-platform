import { MigrationInterface, QueryRunner } from 'typeorm';

/** Makes one-time refund attempts visible and prevents duplicate webhook refunds. */
export class AppointmentRefundState1714600010000 implements MigrationInterface {
  name = 'AppointmentRefundState1714600010000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "CHK_appointments_payment_status"',
    );
    await queryRunner.query(`
      ALTER TABLE "appointments"
      ADD CONSTRAINT "CHK_appointments_payment_status"
      CHECK ("payment_status" IN ('NOT_REQUIRED', 'PENDING', 'PAID', 'FAILED', 'EXPIRED', 'REFUND_PENDING', 'REFUNDED'))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const [result] = (await queryRunner.query(`
      SELECT COUNT(*)::int AS "count" FROM "appointments"
      WHERE "payment_status" IN ('REFUND_PENDING', 'REFUNDED')
    `)) as Array<{ count: number }>;
    if (Number(result?.count ?? 0) > 0) {
      throw new Error('Cannot revert appointment refund states while refund records exist.');
    }
    await queryRunner.query(
      'ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "CHK_appointments_payment_status"',
    );
    await queryRunner.query(`
      ALTER TABLE "appointments"
      ADD CONSTRAINT "CHK_appointments_payment_status"
      CHECK ("payment_status" IN ('NOT_REQUIRED', 'PENDING', 'PAID', 'FAILED', 'EXPIRED'))
    `);
  }
}
