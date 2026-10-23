/**
 * Development demo seed.  Run with:  npm run seed
 *
 * Safe by construction:
 *  - Refuses to run when NODE_ENV=production (there is no override).
 *  - Insert-or-update by stable keys (users.phone "demo-doc-NNN", doctors.license_number
 *    "DEMO-DOC-NNN", brands.catalog_key), so running it repeatedly never duplicates anything.
 *  - Only ever touches rows it owns: demo-flagged doctors/brands and its own DEMO_ESTIMATE
 *    prices. Real users, doctors, appointments and orders are never read-modified or deleted.
 *  - Never deletes, truncates or resets, and never changes stock of an existing product.
 *  - Runs in one transaction: either everything is seeded or nothing is.
 *  - Creates no passwords or credentials; demo doctors cannot sign in.
 *
 * Requires the schema from `npm run migration:run` (it does not create or sync tables).
 */
import 'reflect-metadata';
import { config } from 'dotenv';
import { join } from 'path';

config({ path: join(__dirname, '..', '..', '..', '.env') });

import Redis from 'ioredis';
import { EntityManager } from 'typeorm';
import { AppDataSource } from '../data-source';
import { User, UserRole } from '../entities/user.entity';
import { Doctor } from '../entities/doctor.entity';
import { Generic } from '../entities/generic.entity';
import { Medicine } from '../entities/medicine.entity';
import { Variant } from '../entities/variant.entity';
import { Price, PriceSource } from '../entities/price.entity';
import { LabTest } from '../entities/lab-test.entity';
import { DEMO_DOCTORS } from './data/doctors.demo';
import { DEMO_MEDICINES, describeDemoMedicine } from './data/medicines.demo';
import { DEMO_LAB_TESTS } from './data/lab-tests.demo';
import { discountPercent, paiseToDecimal, toPaise } from '../../common/utils/money.util';

interface Tally {
  created: number;
  updated: number;
}
const tally = (): Tally => ({ created: 0, updated: 0 });

async function seedDoctors(em: EntityManager): Promise<Tally> {
  const t = tally();
  const users = em.getRepository(User);
  const doctors = em.getRepository(Doctor);

  for (const [i, d] of DEMO_DOCTORS.entries()) {
    // Not an E.164 number, so the OTP login flow can never match or reach this account.
    const phone = `demo-doc-${String(i + 1).padStart(3, '0')}`;

    let user = await users.findOne({ where: { phone } });
    if (!user) {
      user = await users.save(
        users.create({
          phone,
          name: d.name,
          role: UserRole.DOCTOR,
          gender: d.gender,
          isActive: true,
          isVerified: false,
        }),
      );
    } else if (user.name !== d.name || user.gender !== d.gender) {
      user.name = d.name;
      user.gender = d.gender;
      await users.save(user);
    }

    const fields = {
      specialization: d.specialization,
      experienceYears: d.experienceYears,
      bio: d.bio,
      consultationFee: d.fee,
      languages: d.languages,
      education: d.degrees.map((degree) => ({ degree, institution: 'Demo data', year: 0 })),
      city: d.city,
      clinicName: d.clinicName,
      consultationMode: d.mode,
      availabilitySchedule: d.schedule,
    };

    const existing = await doctors.findOne({ where: { licenseNumber: d.key } });
    if (existing) {
      if (!existing.isDemo) {
        throw new Error(`${d.key} belongs to a non-demo doctor; refusing to overwrite it.`);
      }
      // Ratings, review counts and availability toggles are left as they are.
      await doctors.save(Object.assign(existing, fields));
      t.updated++;
    } else {
      await doctors.save(
        doctors.create({
          ...fields,
          userId: user.id,
          licenseNumber: d.key,
          isDemo: true,
          isVerified: false,
          rating: 0,
          reviewCount: 0,
          isAvailableToday: true,
        }),
      );
      t.created++;
    }
  }
  return t;
}

async function seedMedicines(em: EntityManager): Promise<Tally> {
  const t = tally();
  const generics = em.getRepository(Generic);
  const brands = em.getRepository(Medicine);
  const variants = em.getRepository(Variant);
  const prices = em.getRepository(Price);

  for (const m of DEMO_MEDICINES) {
    let generic = await generics.findOne({ where: { name: m.generic } });
    if (!generic) {
      generic = await generics.save(generics.create({ name: m.generic, category: m.category }));
    } else if (generic.category !== m.category) {
      generic.category = m.category;
      generic = await generics.save(generic);
    }

    const fields = {
      name: m.brand,
      manufacturer: m.manufacturer ?? undefined,
      genericId: generic.id,
      requiresPrescription: m.requiresPrescription,
      description: describeDemoMedicine(m),
      isDemo: true,
      isActive: true,
    };

    let brand = await brands.findOne({ where: { catalogKey: m.key } });
    if (brand) {
      if (!brand.isDemo) {
        throw new Error(
          `catalog key ${m.key} belongs to a non-demo product; refusing to overwrite it.`,
        );
      }
      await brands.save(Object.assign(brand, fields));
      t.updated++;
    } else {
      brand = await brands.save(brands.create({ ...fields, catalogKey: m.key }));
      t.created++;
    }

    let variant = await variants.findOne({
      where: { medicineId: brand.id },
      order: { createdAt: 'ASC' },
    });
    const variantFields = { strength: m.strength ?? undefined, form: m.form, packSize: m.packSize };
    if (variant) {
      await variants.save(Object.assign(variant, variantFields)); // stock deliberately untouched
    } else {
      variant = await variants.save(
        variants.create({ ...variantFields, medicineId: brand.id, stockQuantity: m.stock }),
      );
    }

    const mrp = toPaise(m.mrp);
    const selling = toPaise(m.sellingPrice);
    if (selling > mrp) throw new Error(`${m.key}: selling price exceeds MRP`);
    const priceFields = {
      mrp: paiseToDecimal(mrp) as unknown as number,
      finalPrice: paiseToDecimal(selling) as unknown as number,
      discountPercent: discountPercent(mrp, selling),
      lastUpdated: new Date(),
    };
    const price = await prices.findOne({
      where: { variantId: variant.id, source: PriceSource.DEMO_ESTIMATE },
    });
    if (price) {
      await prices.save(Object.assign(price, priceFields));
    } else {
      await prices.save(
        prices.create({ ...priceFields, variantId: variant.id, source: PriceSource.DEMO_ESTIMATE }),
      );
    }
  }
  return t;
}

async function seedLabTests(em: EntityManager): Promise<Tally> {
  const t = tally();
  const repo = em.getRepository(LabTest);
  // Demo flag only: sample-based tests list home collection, imaging stays lab-only.
  const homeCollectionFor = (category: string) => category !== 'Imaging';
  const demoFields = {
    description: 'Illustrative demo listing only. This is not a real laboratory service or medical advice.',
    sampleType: 'Demo only',
    preparationInstructions: 'No real service is available; do not use this listing to prepare for testing.',
    labLocation: 'Demo listing only',
    isDemo: true,
    isActive: true,
  };
  for (const test of DEMO_LAB_TESTS) {
    // New catalog rows are unmistakably demo-only and carry no diagnostic/treatment claims.
    const existing = await repo.findOne({ where: { name: test.name } });
    if (!existing) {
      await repo.save(repo.create({ ...test, ...demoFields, homeCollectionAvailable: homeCollectionFor(test.category) }));
      t.created++;
    } else if (!existing.isDemo) {
      // Rows from the legacy seed share these names but were never flagged, so the catalog API
      // (which lists only flagged demo rows) hid them. Flag them; booking history keeps pointing at them.
      await repo.update(existing.id, { ...demoFields, homeCollectionAvailable: homeCollectionFor(test.category) });
      t.updated++;
    } else if (existing.homeCollectionAvailable !== homeCollectionFor(test.category)) {
      await repo.update(existing.id, { homeCollectionAvailable: homeCollectionFor(test.category) });
      t.updated++;
    }
  }
  return t;
}

/** The API caches doctor lists and medicine searches; drop them so seeded rows show up at once. */
async function clearApiCaches(): Promise<void> {
  const redis = new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB ?? '0', 10),
    lazyConnect: true,
    connectTimeout: 2000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  redis.on('error', () => undefined);
  try {
    await redis.connect();
    for (const pattern of ['doctors:*', 'medicine:*']) {
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
        cursor = next;
        if (keys.length) await redis.del(keys);
      } while (cursor !== '0');
    }
    console.log('Cleared doctor/medicine API caches in Redis.');
  } catch (err) {
    console.warn(
      `Could not clear Redis caches (${(err as Error).message}); lists may lag up to 1 hour.`,
    );
  } finally {
    redis.disconnect();
  }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed demo data: NODE_ENV=production.');
    process.exit(1);
  }

  await AppDataSource.initialize();
  console.log(`Seeding demo data into ${process.env.DB_NAME}@${process.env.DB_HOST} ...`);

  try {
    const result = await AppDataSource.transaction(async (em) => ({
      doctors: await seedDoctors(em),
      medicines: await seedMedicines(em),
      labTests: await seedLabTests(em),
    }));

    for (const [name, r] of Object.entries(result)) {
      console.log(`  ${name}: ${r.created} created, ${r.updated} updated`);
    }
    console.log(
      `Done. Catalog totals: ${DEMO_DOCTORS.length} demo doctors, ${DEMO_MEDICINES.length} demo medicines.`,
    );
  } finally {
    await AppDataSource.destroy();
  }
  await clearApiCaches();
}

main().catch((err: Error) => {
  console.error(`Seed failed (nothing was written): ${err.message}`);
  process.exit(1);
});
