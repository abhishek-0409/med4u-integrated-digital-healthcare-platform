import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMedicalHistories1714600001000 implements MigrationInterface {
  name = 'AddMedicalHistories1714600001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "medical_histories" (
        "id"                   UUID          NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"              UUID          NOT NULL,
        "allergies"            JSONB         NOT NULL DEFAULT '[]',
        "chronic_conditions"   JSONB         NOT NULL DEFAULT '[]',
        "past_surgeries"       JSONB         NOT NULL DEFAULT '[]',
        "current_medications"  JSONB         NOT NULL DEFAULT '[]',
        "family_history"       JSONB         NOT NULL DEFAULT '[]',
        "notes"                TEXT,
        "created_at"           TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"           TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_medical_histories"      PRIMARY KEY ("id"),
        CONSTRAINT "UQ_medical_histories_user" UNIQUE ("user_id"),
        CONSTRAINT "FK_medical_histories_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_medical_histories_user_id" ON "medical_histories" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "medical_histories" CASCADE`);
  }
}
