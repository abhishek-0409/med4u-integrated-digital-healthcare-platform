import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive only: nothing here drops or rewrites existing rows.
 *  - appointments.call_log: entity column that no earlier migration created
 *  - doctors: demo flag + clinic name
 *  - brands/variants/prices: catalog key, description, image, stock, demo price source, money checks
 *  - orders / order_items for pharmacy checkout
 */
export class CatalogOrdersAndDemoData1714600004000 implements MigrationInterface {
  name = 'CatalogOrdersAndDemoData1714600004000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── Pre-existing drift: the entity has this column but no earlier migration created it ──
    await queryRunner.query(`ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "call_log" jsonb`);

    // ── Doctors ────────────────────────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "is_demo" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "clinic_name" character varying(150)`,
    );

    // ── Brands (medicines) ─────────────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "catalog_key" character varying(100)`,
    );
    await queryRunner.query(`ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "description" text`);
    await queryRunner.query(
      `ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "image_url" character varying(500)`,
    );
    await queryRunner.query(
      `ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "is_demo" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "brands" ADD CONSTRAINT "UQ_brands_catalog_key" UNIQUE ("catalog_key")`,
    );

    // ── Variants: stock ────────────────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "variants" ADD COLUMN IF NOT EXISTS "stock_quantity" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "variants" ADD CONSTRAINT "CHK_variants_stock_non_negative" CHECK ("stock_quantity" >= 0)`,
    );

    // ── Prices: demo source + sanity checks ────────────────────────────────
    // NOT VALID keeps any legacy rows untouched while enforcing the rule for every new write.
    // The enum is named price_source_enum when built by migrations and prices_source_enum when built by
    // TypeORM synchronize, so look the name up instead of assuming it.
    await queryRunner.query(`
      DO $$
      DECLARE enum_name text;
      BEGIN
        SELECT udt_name INTO enum_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'prices' AND column_name = 'source';
        EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', enum_name, 'DEMO_ESTIMATE');
      END $$
    `);
    await queryRunner.query(
      `ALTER TABLE "prices" ADD CONSTRAINT "CHK_prices_valid" CHECK ("mrp" >= 0 AND "final_price" >= 0 AND "final_price" <= "mrp") NOT VALID`,
    );

    // ── Orders ─────────────────────────────────────────────────────────────
    await queryRunner.query(
      `CREATE TYPE "order_status_enum" AS ENUM ('PLACED', 'PENDING_REVIEW', 'CANCELLED')`,
    );
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id"               uuid                     NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at"       TIMESTAMP WITH TIME ZONE,
        "user_id"          uuid                     NOT NULL,
        "status"           "order_status_enum"      NOT NULL DEFAULT 'PLACED',
        "total"            numeric(12,2)            NOT NULL,
        "delivery_address" text                     NOT NULL,
        "prescription_id"  uuid,
        "is_demo"          boolean                  NOT NULL DEFAULT false,
        "idempotency_key"  character varying(64),
        CONSTRAINT "PK_orders" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_orders_total_non_negative" CHECK ("total" >= 0),
        CONSTRAINT "FK_orders_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_orders_prescription_id" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_orders_user_created" ON "orders" ("user_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_orders_user_idempotency_key" ON "orders" ("user_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "order_items" (
        "id"                    uuid                     NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at"            TIMESTAMP WITH TIME ZONE,
        "order_id"              uuid                     NOT NULL,
        "variant_id"            uuid                     NOT NULL,
        "product_name"          character varying(200)   NOT NULL,
        "generic_name"          character varying(200)   NOT NULL,
        "strength"              character varying(50),
        "form"                  character varying(50)    NOT NULL,
        "pack_size"             character varying(100),
        "requires_prescription" boolean                  NOT NULL,
        "quantity"              integer                  NOT NULL,
        "mrp"                   numeric(10,2)            NOT NULL,
        "unit_price"            numeric(10,2)            NOT NULL,
        "line_total"            numeric(12,2)            NOT NULL,
        CONSTRAINT "PK_order_items" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_order_items_quantity" CHECK ("quantity" > 0),
        CONSTRAINT "CHK_order_items_prices" CHECK ("unit_price" >= 0 AND "unit_price" <= "mrp" AND "line_total" >= 0),
        CONSTRAINT "FK_order_items_order_id" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_order_items_variant_id" FOREIGN KEY ("variant_id") REFERENCES "variants"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_order_items_order_id" ON "order_items" ("order_id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "order_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "orders"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "order_status_enum"`);

    await queryRunner.query(`ALTER TABLE "prices" DROP CONSTRAINT IF EXISTS "CHK_prices_valid"`);
    // Postgres cannot drop a single enum value; 'DEMO_ESTIMATE' stays in price_source_enum (harmless).
    await queryRunner.query(
      `ALTER TABLE "variants" DROP CONSTRAINT IF EXISTS "CHK_variants_stock_non_negative"`,
    );
    await queryRunner.query(`ALTER TABLE "variants" DROP COLUMN IF EXISTS "stock_quantity"`);

    await queryRunner.query(
      `ALTER TABLE "brands" DROP CONSTRAINT IF EXISTS "UQ_brands_catalog_key"`,
    );
    for (const col of ['is_active', 'is_demo', 'image_url', 'description', 'catalog_key']) {
      await queryRunner.query(`ALTER TABLE "brands" DROP COLUMN IF EXISTS "${col}"`);
    }
    await queryRunner.query(`ALTER TABLE "doctors" DROP COLUMN IF EXISTS "clinic_name"`);
    await queryRunner.query(`ALTER TABLE "doctors" DROP COLUMN IF EXISTS "is_demo"`);
  }
}
