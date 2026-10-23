import { MigrationInterface, QueryRunner } from 'typeorm';

export class PharmacyAndDoctorSchema1714600002000 implements MigrationInterface {
  name = 'PharmacyAndDoctorSchema1714600002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── Generics ───────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "generics" (
        "id"          uuid                     NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at"  TIMESTAMP WITH TIME ZONE,
        "name"        character varying(200)   NOT NULL,
        "category"    character varying(100)   NOT NULL,
        "description" text,
        CONSTRAINT "PK_generics" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_generics_name" UNIQUE ("name")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_generics_name" ON "generics" ("name")`);

    // ── Brands (medicines) ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "brands" (
        "id"                   uuid                     NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at"           TIMESTAMP WITH TIME ZONE,
        "name"                 character varying(200)   NOT NULL,
        "manufacturer"         character varying(150),
        "generic_id"           uuid                     NOT NULL,
        "requires_prescription" boolean                 NOT NULL DEFAULT false,
        CONSTRAINT "PK_brands" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_brands_name" ON "brands" ("name")`);
    await queryRunner.query(`
      ALTER TABLE "brands"
        ADD CONSTRAINT "FK_brands_generic_id"
        FOREIGN KEY ("generic_id") REFERENCES "generics"("id") ON DELETE CASCADE
    `);

    // ── Variants ───────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "variants" (
        "id"          uuid                     NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at"  TIMESTAMP WITH TIME ZONE,
        "medicine_id" uuid                     NOT NULL,
        "strength"    character varying(50),
        "form"        character varying(50)    NOT NULL,
        "pack_size"   character varying(100),
        CONSTRAINT "PK_variants" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_variants_medicine_id" ON "variants" ("medicine_id")`);
    await queryRunner.query(`
      ALTER TABLE "variants"
        ADD CONSTRAINT "FK_variants_medicine_id"
        FOREIGN KEY ("medicine_id") REFERENCES "brands"("id") ON DELETE CASCADE
    `);

    // ── Prices ─────────────────────────────────────────────────────────────
    await queryRunner.query(`CREATE TYPE "price_source_enum" AS ENUM ('MYUPCHAR', 'SCRAPER', 'MANUAL')`);
    await queryRunner.query(`
      CREATE TABLE "prices" (
        "id"               uuid                     NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at"       TIMESTAMP WITH TIME ZONE,
        "variant_id"       uuid                     NOT NULL,
        "mrp"              numeric(10,2)             NOT NULL,
        "final_price"      numeric(10,2)             NOT NULL,
        "discount_percent" numeric(5,2)              NOT NULL DEFAULT 0,
        "source"           "price_source_enum"       NOT NULL DEFAULT 'MANUAL',
        "last_updated"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_prices" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_prices_variant_source" UNIQUE ("variant_id", "source")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_prices_variant_id" ON "prices" ("variant_id")`);
    await queryRunner.query(`
      ALTER TABLE "prices"
        ADD CONSTRAINT "FK_prices_variant_id"
        FOREIGN KEY ("variant_id") REFERENCES "variants"("id") ON DELETE CASCADE
    `);

    // ── Doctor new fields ──────────────────────────────────────────────────
    await queryRunner.query(`CREATE TYPE "consultation_mode_enum" AS ENUM ('ONLINE', 'OFFLINE', 'BOTH')`);
    await queryRunner.query(`ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "city" character varying(100)`);
    await queryRunner.query(`ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "is_available_today" boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "consultation_mode" "consultation_mode_enum" NOT NULL DEFAULT 'BOTH'`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_doctors_city" ON "doctors" ("city")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_doctors_city"`);
    await queryRunner.query(`ALTER TABLE "doctors" DROP COLUMN IF EXISTS "consultation_mode"`);
    await queryRunner.query(`ALTER TABLE "doctors" DROP COLUMN IF EXISTS "is_available_today"`);
    await queryRunner.query(`ALTER TABLE "doctors" DROP COLUMN IF EXISTS "city"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "consultation_mode_enum"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "prices"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "price_source_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "variants"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "brands"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "generics"`);
  }
}
