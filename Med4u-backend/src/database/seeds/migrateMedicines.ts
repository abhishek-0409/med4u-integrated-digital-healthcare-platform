/**
 * Migration script: old `medicines` table → generics / brands / variants
 *
 * Run after applying PharmacyAndDoctorSchema migration:
 *   npm run migrate:medicines
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { join } from 'path';
import { Generic } from '../entities/generic.entity';
import { Medicine } from '../entities/medicine.entity';
import { Variant } from '../entities/variant.entity';

config({ path: join(__dirname, '..', '..', '..', '.env') });

interface OldMedicine {
  id: string;
  name: string;
  generic_name: string | null;
  manufacturer: string | null;
  category: string;
  description: string | null;
  requires_prescription: boolean;
}

function extractStrength(name: string): string | undefined {
  const match = name.match(/(\d+(?:\.\d+)?\s*(?:mg|IU|ml|mcg|g))/i);
  return match ? match[1].replace(/\s+/, '') : undefined;
}

function inferForm(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('inhaler')) return 'inhaler';
  if (n.includes('syrup')) return 'syrup';
  if (n.includes('injection')) return 'injection';
  if (n.includes('capsule')) return 'capsule';
  if (n.includes('drops')) return 'drops';
  if (n.includes('cream') || n.includes('gel')) return 'cream';
  if (n.includes('sachet')) return 'sachet';
  return 'tablet';
}

async function migrateMedicines() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'med4u',
    entities: [Generic, Medicine, Variant],
    synchronize: false,
  });

  await dataSource.initialize();
  console.log('✅ Database connected');

  // Read from the old medicines table via raw SQL (entity now maps to brands)
  let oldMedicines: OldMedicine[];
  try {
    oldMedicines = await dataSource.query(
      `SELECT id, name, generic_name, manufacturer, category, description, requires_prescription
       FROM medicines
       WHERE deleted_at IS NULL`,
    );
  } catch {
    console.error('❌ Could not read from "medicines" table. Has it been created/seeded yet?');
    await dataSource.destroy();
    process.exit(1);
  }

  if (oldMedicines.length === 0) {
    console.log('⏭️  No records in old medicines table — nothing to migrate.');
    await dataSource.destroy();
    return;
  }

  console.log(`📦 Found ${oldMedicines.length} records in old medicines table`);

  const medicineRepo = dataSource.getRepository(Medicine);

  let created = 0;
  let skipped = 0;

  for (const old of oldMedicines) {
    // Skip if a brand with this name is already migrated
    const existing = await medicineRepo.findOne({ where: { name: old.name } });
    if (existing) {
      skipped++;
      continue;
    }

    await dataSource.transaction(async (manager) => {
      const genericName = old.generic_name?.trim() || old.name.split(' ')[0];

      // Find or create generic
      let generic = await manager.findOne(Generic, { where: { name: genericName } });
      if (!generic) {
        generic = await manager.save(
          manager.create(Generic, {
            name: genericName,
            category: old.category,
            description: old.description ?? undefined,
          }),
        );
      }

      // Create brand
      const brand = await manager.save(
        manager.create(Medicine, {
          name: old.name,
          manufacturer: old.manufacturer ?? undefined,
          genericId: generic.id,
          requiresPrescription: old.requires_prescription,
        }),
      );

      // Create variant
      await manager.save(
        manager.create(Variant, {
          medicineId: brand.id,
          strength: extractStrength(old.name),
          form: inferForm(old.name),
          packSize: '10 units',
        }),
      );
    });

    created++;
    if (created % 10 === 0) {
      console.log(`  ↳ Migrated ${created}/${oldMedicines.length}…`);
    }
  }

  console.log(`✅ Migration complete — created: ${created}, skipped (already existed): ${skipped}`);
  await dataSource.destroy();
}

migrateMedicines().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
