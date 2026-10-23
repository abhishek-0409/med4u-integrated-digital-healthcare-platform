import { MigrationInterface, QueryRunner } from 'typeorm';

/** Links a patient order to the issued clinical prescription used for pharmacist review. */
export class ClinicalPrescriptionOrders1714600018000 implements MigrationInterface {
  name = 'ClinicalPrescriptionOrders1714600018000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "orders" ADD COLUMN "clinical_prescription_id" uuid`);
    await q.query(`
      ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_clinical_prescription"
      FOREIGN KEY ("clinical_prescription_id") REFERENCES "clinical_prescriptions"("id") ON DELETE RESTRICT
    `);
    await q.query(`
      CREATE UNIQUE INDEX "UQ_orders_active_clinical_prescription"
      ON "orders" ("clinical_prescription_id")
      WHERE "clinical_prescription_id" IS NOT NULL AND "status" <> 'CANCELLED'
    `);
    await q.query(`
      ALTER TABLE "orders" ADD CONSTRAINT "CHK_orders_one_prescription_source"
      CHECK ("prescription_id" IS NULL OR "clinical_prescription_id" IS NULL)
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "CHK_orders_one_prescription_source"`);
    await q.query(`DROP INDEX IF EXISTS "UQ_orders_active_clinical_prescription"`);
    await q.query(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "FK_orders_clinical_prescription"`);
    await q.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "clinical_prescription_id"`);
  }
}
