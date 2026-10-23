/**
 * End-to-end pharmacy tests against a real PostgreSQL database, through the real controllers, services,
 * role guard, response envelope and exception filter. Only authentication is replaced: a test guard
 * reads `Authorization: Bearer test:<userId>:<role>` instead of verifying a JWT.
 *
 * Opt-in because it needs a database and WIPES its `public` schema:
 *   TEST_DB_NAME=med4u_test npx jest pharmacy.integration       (bash)
 *   $env:TEST_DB_NAME='med4u_test'; npx jest pharmacy.integration   (PowerShell)
 * The database name must end in `_test`. Connection settings come from .env (DB_HOST, DB_USERNAME, ...).
 */
import {
  CanActivate,
  ExecutionContext,
  Global,
  INestApplication,
  Injectable,
  Module,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { config as loadEnv } from 'dotenv';
import { randomBytes, randomUUID } from 'crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request = require('supertest');
import { DataSource } from 'typeorm';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { GlobalHttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ResponseInterceptor } from '../../common/interceptors/response.interceptor';
import { ALL_ENTITIES } from '../../database/database.module';
import { InitialSchema1714600000000 } from '../../database/migrations/1714600000000-InitialSchema';
import { AddMedicalHistories1714600001000 } from '../../database/migrations/1714600001000-AddMedicalHistories';
import { PharmacyAndDoctorSchema1714600002000 } from '../../database/migrations/1714600002000-PharmacyAndDoctorSchema';
import { AppointmentBookingIntegrity1714600003000 } from '../../database/migrations/1714600003000-AppointmentBookingIntegrity';
import { CatalogOrdersAndDemoData1714600004000 } from '../../database/migrations/1714600004000-CatalogOrdersAndDemoData';
import { AppointmentIntervalsAndFeeSnapshot1714600005000 } from '../../database/migrations/1714600005000-AppointmentIntervalsAndFeeSnapshot';
import { PharmacyFulfilment1714600006000 } from '../../database/migrations/1714600006000-PharmacyFulfilment';
import { ProfileOnboarding1714600008000 } from '../../database/migrations/1714600008000-ProfileOnboarding';
import { DoctorProvenance1714600011000 } from '../../database/migrations/1714600011000-DoctorProvenance';
import { StagingFixtureFlag1714600012000 } from '../../database/migrations/1714600012000-StagingFixtureFlag';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { MedicineModule } from '../medicines/medicine.module';
import { PrescriptionModule } from '../prescriptions/prescription.module';
import { OrderModule } from './order.module';

loadEnv({ path: join(__dirname, '..', '..', '..', '.env') });

const TEST_DB = process.env.TEST_DB_NAME;
const suite = TEST_DB && TEST_DB.endsWith('_test') ? describe : describe.skip;

jest.setTimeout(120_000);

// ── Test doubles ────────────────────────────────────────────────────────────

/** Stands in for JwtAuthGuard: `Bearer test:<userId>:<role>`; honours @Public like the real guard. */
@Injectable()
class TestAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const [, sub, role] = /^Bearer test:([^:]+):(\w+)$/.exec(req.headers.authorization ?? '') ?? [];
    if (!sub) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
      });
    }
    req.user = { sub, role, phone: '' };
    return true;
  }
}

@Global()
@Module({
  providers: [
    { provide: REDIS_CLIENT, useValue: { get: async () => null, setex: async () => 'OK' } },
    {
      provide: WINSTON_MODULE_NEST_PROVIDER,
      useValue: {
        log() {},
        error: (m: string, s?: string) => {
          if (process.env.TEST_DEBUG) console.error(m, s);
        },
        warn() {},
      },
    },
  ],
  exports: [REDIS_CLIENT, WINSTON_MODULE_NEST_PROVIDER],
})
class TestInfraModule {}

const MIGRATIONS = [
  InitialSchema1714600000000,
  AddMedicalHistories1714600001000,
  PharmacyAndDoctorSchema1714600002000,
  AppointmentBookingIntegrity1714600003000,
  CatalogOrdersAndDemoData1714600004000,
  AppointmentIntervalsAndFeeSnapshot1714600005000,
  PharmacyFulfilment1714600006000,
  ProfileOnboarding1714600008000,
  DoctorProvenance1714600011000,
  StagingFixtureFlag1714600012000,
];

const dbOptions = () => ({
  type: 'postgres' as const,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: TEST_DB,
});

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('fake-prescription-image'),
]);

const DELIVERY = {
  name: 'Asha Patel',
  phone: '98765 43210',
  line1: '12 Lake View Road, Kothrud',
  city: 'Pune',
  pincode: '411038',
};

suite('Pharmacy (PostgreSQL)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let storageDir: string;

  const ids = {} as Record<
    'patientA' | 'patientB' | 'patientC' | 'patientD' | 'pharmacist' | 'doctor',
    string
  >;
  const roles = {
    patientA: 'patient',
    patientB: 'patient',
    patientC: 'patient',
    patientD: 'patient',
    pharmacist: 'pharmacist',
    doctor: 'doctor',
  } as const;
  const v = {} as Record<'plain' | 'rx' | 'scarce' | 'pricey', string>;

  const as = (who: keyof typeof ids) => `Bearer test:${ids[who]}:${roles[who]}`;
  const http = () => request(app.getHttpServer());
  const stock = async (variant: string): Promise<number> =>
    Number(
      (await ds.query('SELECT stock_quantity FROM variants WHERE id = $1', [variant]))[0]
        .stock_quantity,
    );
  const setStock = (variant: string, n: number) =>
    ds.query('UPDATE variants SET stock_quantity = $1 WHERE id = $2', [n, variant]);

  const placeOrder = (who: keyof typeof ids, body: Record<string, unknown>) =>
    http()
      .post('/v1/orders')
      .set('Authorization', as(who))
      .send({ delivery: DELIVERY, ...body });
  const line = (variantId: string, quantity = 1) => ({ variantId, quantity });
  const key = () => `k-${randomUUID()}`;

  const upload = (who: keyof typeof ids, data: Buffer = PNG, name = 'rx.png', type = 'image/png') =>
    http()
      .post('/v1/prescription-uploads')
      .set('Authorization', as(who))
      .attach('file', data, { filename: name, contentType: type });

  /** Uploads a prescription and places a prescription-only order with it. */
  async function rxOrder(who: keyof typeof ids = 'patientA', quantity = 1) {
    const rx = await upload(who);
    expect(rx.status).toBe(201);
    const order = await placeOrder(who, {
      items: [line(v.rx, quantity)],
      prescriptionId: rx.body.data.id,
      idempotencyKey: key(),
    });
    expect(order.status).toBe(201);
    return { rxId: rx.body.data.id as string, orderId: order.body.data.id as string };
  }

  beforeAll(async () => {
    // Fresh schema built by the real migration chain.
    const admin = new DataSource(dbOptions());
    await admin.initialize();
    await admin.query('DROP SCHEMA public CASCADE');
    await admin.query('CREATE SCHEMA public');
    await admin.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await admin.destroy();
    const migrator = new DataSource({ ...dbOptions(), entities: [], migrations: MIGRATIONS });
    await migrator.initialize();
    await migrator.runMigrations();
    await migrator.destroy();

    storageDir = mkdtempSync(join(tmpdir(), 'med4u-rx-'));
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              ENCRYPTION_KEY: 'test-encryption-key-0123456789abcdef',
              PRESCRIPTION_STORAGE_DIR: storageDir,
            }),
          ],
        }),
        TypeOrmModule.forRoot({ ...dbOptions(), entities: ALL_ENTITIES, synchronize: false }),
        TestInfraModule,
        MedicineModule,
        OrderModule,
        PrescriptionModule,
      ],
      providers: [
        { provide: APP_GUARD, useClass: TestAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
        { provide: APP_FILTER, useClass: GlobalHttpExceptionFilter },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);

    // Fixtures
    for (const who of Object.keys(roles) as Array<keyof typeof ids>) {
      const rows = await ds.query(
        `INSERT INTO users (phone, name, role) VALUES ($1, $2, $3::users_role_enum) RETURNING id`,
        [`+9100000${Math.floor(Math.random() * 900000 + 100000)}`, `Test ${who}`, roles[who]],
      );
      ids[who] = rows[0].id;
    }
    const [{ id: genericId }] = await ds.query(
      `INSERT INTO generics (name, category) VALUES ('Testamol', 'ZZ-Test-Category') RETURNING id`,
    );
    const makeProduct = async (
      key: keyof typeof v,
      name: string,
      rx: boolean,
      stockQty: number,
      mrp: string,
      price: string,
    ) => {
      const [{ id: brandId }] = await ds.query(
        `INSERT INTO brands (name, generic_id, requires_prescription, is_active) VALUES ($1, $2, $3, true) RETURNING id`,
        [name, genericId, rx],
      );
      const [{ id: variantId }] = await ds.query(
        `INSERT INTO variants (medicine_id, strength, form, pack_size, stock_quantity) VALUES ($1, '500 mg', 'tablet', 'Strip of 10', $2) RETURNING id`,
        [brandId, stockQty],
      );
      await ds.query(
        `INSERT INTO prices (variant_id, mrp, final_price, discount_percent, source) VALUES ($1, $2, $3, 0, 'MANUAL')`,
        [variantId, mrp, price],
      );
      v[key] = variantId;
    };
    await makeProduct('plain', 'Plainol', false, 50, '100.00', '80.00');
    await makeProduct('rx', 'Rxitol', true, 50, '200.00', '150.50');
    await makeProduct('scarce', 'Scarcin', false, 5, '10.00', '9.99');
    await makeProduct('pricey', 'Priceon', false, 50, '100.00', '100.00');
  });

  afterAll(async () => {
    await app?.close();
    if (storageDir) rmSync(storageDir, { recursive: true, force: true });
  });

  // ── 1 & 2: catalog ─────────────────────────────────────────────────────────

  describe('catalog', () => {
    it('serves products from the database with server-computed discount, stock and prescription flags', async () => {
      const res = await http().get('/v1/medicines').query({ search: 'Plainol' });
      expect(res.status).toBe(200);
      expect(res.body.meta).toMatchObject({ page: 1, total: 1 });
      expect(res.body.data[0]).toMatchObject({
        id: v.plain,
        name: 'Plainol',
        genericName: 'Testamol',
        strength: '500 mg',
        form: 'tablet',
        packSize: 'Strip of 10',
        requiresPrescription: false,
        stockStatus: 'IN_STOCK',
        purchasable: true,
        price: { mrp: 100, sellingPrice: 80, discountPercent: 20 },
      });
    });

    it('searches by generic name and filters by category, prescription flag and stock', async () => {
      const byGeneric = await http().get('/v1/medicines').query({ search: 'testamol' });
      expect(byGeneric.body.meta.total).toBe(4);
      const byCategory = await http()
        .get('/v1/medicines')
        .query({ category: 'ZZ-Test-Category', requiresPrescription: 'true' });
      expect(byCategory.body.data.map((p: { name: string }) => p.name)).toEqual(['Rxitol']);
      expect(byCategory.body.data[0].requiresPrescription).toBe(true);
      const none = await http().get('/v1/medicines').query({ search: 'no-such-medicine-xyz' });
      expect(none.body.data).toEqual([]);
    });

    it('paginates and sorts on the server', async () => {
      const page1 = await http()
        .get('/v1/medicines')
        .query({ category: 'ZZ-Test-Category', limit: 3, sortBy: 'price_asc' });
      expect(page1.body.meta).toMatchObject({ page: 1, limit: 3, total: 4, totalPages: 2 });
      expect(page1.body.data.map((p: { name: string }) => p.name)).toEqual([
        'Scarcin',
        'Plainol',
        'Priceon',
      ]);
      const page2 = await http()
        .get('/v1/medicines')
        .query({ category: 'ZZ-Test-Category', limit: 3, page: 2, sortBy: 'price_asc' });
      expect(page2.body.data.map((p: { name: string }) => p.name)).toEqual(['Rxitol']);
    });

    it('returns a single product and 404 for an unknown id', async () => {
      expect((await http().get(`/v1/medicines/${v.rx}`)).body.data.requiresPrescription).toBe(true);
      expect((await http().get(`/v1/medicines/${randomUUID()}`)).status).toBe(404);
    });
  });

  // ── 3 / 4 / 5: quote, validation, server-side pricing ──────────────────────

  describe('pricing and validation', () => {
    it('quotes a cart from current database prices and flags problems per line', async () => {
      await setStock(v.scarce, 2);
      const res = await http()
        .post('/v1/orders/quote')
        .set('Authorization', as('patientA'))
        .send({ items: [line(v.plain, 3), line(v.scarce, 4), line(randomUUID(), 1)] });
      await setStock(v.scarce, 5);
      expect(res.status).toBe(200);
      const [plain, scarce, missing] = res.body.data.lines;
      expect(plain).toMatchObject({ issue: null, unitPrice: 80, lineTotal: 240 });
      expect(scarce).toMatchObject({
        issue: 'INSUFFICIENT_STOCK',
        availableQuantity: 2,
        lineTotal: 0,
      });
      expect(missing).toMatchObject({ issue: 'NOT_FOUND', product: null });
      expect(res.body.data).toMatchObject({ total: 240, canCheckout: false });
    });

    it.each([
      ['zero', 0],
      ['negative', -1],
      ['fractional', 1.5],
      ['over the per-line cap', 11],
      ['a string', '2'],
    ])('rejects a %s quantity', async (_label, quantity) => {
      const before = await stock(v.plain);
      const res = await placeOrder('patientA', {
        items: [{ variantId: v.plain, quantity }],
        idempotencyKey: key(),
      });
      expect(res.status).toBe(400);
      expect(await stock(v.plain)).toBe(before);
    });

    it('rejects repeated lines that add up past the per-order cap', async () => {
      const res = await placeOrder('patientA', {
        items: [line(v.plain, 6), line(v.plain, 6)],
        idempotencyKey: key(),
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('QUANTITY_LIMIT_EXCEEDED');
    });

    it('refuses client-supplied price, total, status, payment and owner fields', async () => {
      for (const extra of [
        { price: 0.01 },
        { total: 1 },
        { status: 'DELIVERED' },
        { userId: ids.patientB },
        { paymentStatus: 'PAID' },
      ]) {
        const res = await placeOrder('patientA', {
          items: [line(v.plain)],
          idempotencyKey: key(),
          ...extra,
        });
        expect(res.status).toBe(400);
      }
      const lineWithPrice = await placeOrder('patientA', {
        items: [{ variantId: v.plain, quantity: 1, unitPrice: 1 }],
        idempotencyKey: key(),
      });
      expect(lineWithPrice.status).toBe(400);
    });

    it('computes totals on the server and snapshots prices immutably on the order', async () => {
      const res = await placeOrder('patientA', {
        items: [line(v.plain, 3), line(v.scarce, 2)],
        idempotencyKey: key(),
      });
      expect(res.status).toBe(201);
      const order = res.body.data;
      expect(order).toMatchObject({
        status: 'PLACED',
        total: 259.98,
        paymentStatus: 'UNPAID',
        canCancel: true,
      });
      expect(order.delivery).toMatchObject({
        name: 'Asha Patel',
        phone: '+919876543210',
        city: 'Pune',
        pincode: '411038',
      });

      // A later price change must not rewrite history.
      await ds.query(`UPDATE prices SET final_price = 90.00 WHERE variant_id = $1`, [v.plain]);
      const again = await http().get(`/v1/orders/${order.id}`).set('Authorization', as('patientA'));
      expect(again.body.data.total).toBe(259.98);
      expect(
        again.body.data.items.find((i: { name: string }) => i.name === 'Plainol'),
      ).toMatchObject({ unitPrice: 80, lineTotal: 240 });
      await ds.query(`UPDATE prices SET final_price = 80.00 WHERE variant_id = $1`, [v.plain]);
    });

    it('refuses with PRICE_CHANGED when the confirmed total is stale, without touching stock', async () => {
      const before = await stock(v.pricey);
      await ds.query(`UPDATE prices SET final_price = 95.00 WHERE variant_id = $1`, [v.pricey]);
      const res = await placeOrder('patientA', {
        items: [line(v.pricey, 2)],
        expectedTotal: 200,
        idempotencyKey: key(),
      });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PRICE_CHANGED');
      expect(res.body.error.details).toEqual({ expectedTotal: 200, currentTotal: 190 });
      expect(await stock(v.pricey)).toBe(before);

      const confirmed = await placeOrder('patientA', {
        items: [line(v.pricey, 2)],
        expectedTotal: 190,
        idempotencyKey: key(),
      });
      expect(confirmed.status).toBe(201);
      expect(confirmed.body.data.total).toBe(190);
    });

    it.each([
      ['phone', { phone: '12345' }],
      ['PIN code', { pincode: '0123' }],
      ['name', { name: 'A' }],
      ['address', { line1: 'x' }],
    ])('validates the delivery %s', async (_label, patch) => {
      const res = await http()
        .post('/v1/orders')
        .set('Authorization', as('patientA'))
        .send({
          items: [line(v.plain)],
          delivery: { ...DELIVERY, ...patch },
          idempotencyKey: key(),
        });
      expect(res.status).toBe(400);
    });

    it('treats a retried request with the same idempotency key as the same order', async () => {
      const k = key();
      const before = await stock(v.plain);
      const [a, b] = await Promise.all([
        placeOrder('patientA', { items: [line(v.plain)], idempotencyKey: k }),
        placeOrder('patientA', { items: [line(v.plain)], idempotencyKey: k }),
      ]);
      expect([a.status, b.status].every((s) => s === 201)).toBe(true);
      expect(a.body.data.id).toBe(b.body.data.id);
      expect(await stock(v.plain)).toBe(before - 1);
    });
  });

  // ── 6: concurrency ─────────────────────────────────────────────────────────

  describe('inventory under concurrency', () => {
    it('never oversells: 10 simultaneous single-pack orders against 3 in stock', async () => {
      await setStock(v.scarce, 3);
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          placeOrder(i % 2 ? 'patientA' : 'patientB', {
            items: [line(v.scarce)],
            idempotencyKey: key(),
          }),
        ),
      );
      const ok = results.filter((r) => r.status === 201);
      const refused = results.filter((r) => r.status === 409);
      expect(ok).toHaveLength(3);
      expect(refused).toHaveLength(7);
      expect(refused.every((r) => r.body.error.code === 'INSUFFICIENT_STOCK')).toBe(true);
      expect(await stock(v.scarce)).toBe(0);
    });

    it('never goes negative with multi-pack orders (6 x 2 packs against 5 in stock)', async () => {
      await setStock(v.scarce, 5);
      const results = await Promise.all(
        Array.from({ length: 6 }, () =>
          placeOrder('patientA', { items: [line(v.scarce, 2)], idempotencyKey: key() }),
        ),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(2);
      expect(await stock(v.scarce)).toBe(1);
    });

    it('does not deadlock when carts list the same products in opposite orders', async () => {
      await setStock(v.plain, 100);
      await setStock(v.pricey, 100);
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          placeOrder('patientA', {
            items: i % 2 ? [line(v.plain), line(v.pricey)] : [line(v.pricey), line(v.plain)],
            idempotencyKey: key(),
          }),
        ),
      );
      expect(results.every((r) => r.status === 201)).toBe(true);
      expect(await stock(v.plain)).toBe(92);
      expect(await stock(v.pricey)).toBe(92);
    });

    it('lets only one of two simultaneous orders use the same prescription', async () => {
      const rx = await upload('patientA');
      const before = await stock(v.rx);
      const results = await Promise.all(
        [0, 1].map(() =>
          placeOrder('patientA', {
            items: [line(v.rx)],
            prescriptionId: rx.body.data.id,
            idempotencyKey: key(),
          }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await stock(v.rx)).toBe(before - 1);
    });
  });

  // ── 7: prescription workflow ───────────────────────────────────────────────

  describe('prescription-only orders', () => {
    it('cannot be placed without a prescription, and stock is untouched', async () => {
      const before = await stock(v.rx);
      const res = await placeOrder('patientA', { items: [line(v.rx)], idempotencyKey: key() });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('PRESCRIPTION_REQUIRED');
      expect(await stock(v.rx)).toBe(before);
    });

    it("cannot use someone else's, an unknown or an unneeded prescription", async () => {
      const others = await upload('patientB');
      const stolen = await placeOrder('patientA', {
        items: [line(v.rx)],
        prescriptionId: others.body.data.id,
        idempotencyKey: key(),
      });
      expect(stolen.status).toBe(422);
      expect(stolen.body.error.code).toBe('PRESCRIPTION_INVALID');
      const unknown = await placeOrder('patientA', {
        items: [line(v.rx)],
        prescriptionId: randomUUID(),
        idempotencyKey: key(),
      });
      expect(unknown.body.error.code).toBe('PRESCRIPTION_INVALID'); // same answer: ids cannot be probed

      const mine = await upload('patientA');
      const unneeded = await placeOrder('patientA', {
        items: [line(v.plain)],
        prescriptionId: mine.body.data.id,
        idempotencyKey: key(),
      });
      expect(unneeded.status).toBe(400);
      expect(unneeded.body.error.code).toBe('PRESCRIPTION_NOT_REQUIRED');
    });

    it('waits in PENDING_REVIEW and cannot be advanced by staff without approval', async () => {
      const { rxId, orderId } = await rxOrder();
      const order = await http().get(`/v1/orders/${orderId}`).set('Authorization', as('patientA'));
      expect(order.body.data).toMatchObject({
        status: 'PENDING_REVIEW',
        awaitingPrescriptionReview: true,
        requiresPrescription: true,
        prescription: { id: rxId, status: 'PENDING' },
      });

      for (const status of ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED']) {
        const res = await http()
          .patch(`/v1/pharmacy/orders/${orderId}/status`)
          .set('Authorization', as('pharmacist'))
          .send({ status });
        expect([409, 422]).toContain(res.status);
      }
      expect((await ds.query('SELECT status FROM orders WHERE id = $1', [orderId]))[0].status).toBe(
        'PENDING_REVIEW',
      );
    });

    it('shows the pharmacist a review queue entry with the medicines to check', async () => {
      const { rxId, orderId } = await rxOrder();
      const queue = await http()
        .get('/v1/pharmacy/prescriptions')
        .set('Authorization', as('pharmacist'));
      expect(queue.status).toBe(200);
      const entry = queue.body.data.find((e: { id: string }) => e.id === rxId);
      expect(entry).toMatchObject({
        status: 'PENDING',
        patientName: 'Test patientA',
        reviewedBy: null,
      });
      expect(entry.order).toMatchObject({ id: orderId, status: 'PENDING_REVIEW' });
      expect(entry.order.items[0]).toMatchObject({ name: 'Rxitol', quantity: 1 });
      // Queue lists oldest first and never exposes storage details.
      expect(JSON.stringify(queue.body)).not.toMatch(/storage|sha256/i);
    });

    it('lets staff (and only staff) open one prescription with its order for review', async () => {
      const { rxId, orderId } = await rxOrder('patientB');
      const res = await http()
        .get(`/v1/pharmacy/prescriptions/${rxId}`)
        .set('Authorization', as('pharmacist'));
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: rxId,
        status: 'PENDING',
        patientName: 'Test patientB',
      });
      expect(res.body.data.order).toMatchObject({ id: orderId });
      expect(
        (
          await http()
            .get(`/v1/pharmacy/prescriptions/${rxId}`)
            .set('Authorization', as('patientB'))
        ).status,
      ).toBe(403);
      expect(
        (
          await http()
            .get(`/v1/pharmacy/prescriptions/${randomUUID()}`)
            .set('Authorization', as('pharmacist'))
        ).status,
      ).toBe(404);
    });

    it('approval records the reviewer and time, and releases the order', async () => {
      const { rxId, orderId } = await rxOrder();
      const res = await http()
        .post(`/v1/pharmacy/prescriptions/${rxId}/approve`)
        .set('Authorization', as('pharmacist'));
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ status: 'APPROVED', reviewedBy: ids.pharmacist });
      expect(res.body.data.reviewedAt).toBeTruthy();

      const row = (
        await ds.query(
          'SELECT status, reviewed_by, reviewed_at FROM prescription_uploads WHERE id = $1',
          [rxId],
        )
      )[0];
      expect(row).toMatchObject({ status: 'APPROVED', reviewed_by: ids.pharmacist });
      expect(row.reviewed_at).toBeInstanceOf(Date);

      const order = await http().get(`/v1/orders/${orderId}`).set('Authorization', as('patientA'));
      expect(order.body.data).toMatchObject({
        status: 'CONFIRMED',
        prescription: { status: 'APPROVED' },
      });
      expect(JSON.stringify(order.body.data)).not.toContain(ids.pharmacist); // reviewer identity is not shown to patients

      const staff = await http()
        .get(`/v1/pharmacy/orders/${orderId}`)
        .set('Authorization', as('pharmacist'));
      expect(staff.body.data.history.at(-1)).toMatchObject({
        status: 'CONFIRMED',
        actorRole: 'pharmacist',
        note: 'Prescription approved',
      });
      expect(staff.body.data.customer).toMatchObject({ id: ids.patientA });

      // Now (and only now) the order can proceed through the lifecycle.
      for (const status of ['PROCESSING', 'SHIPPED', 'DELIVERED']) {
        const step = await http()
          .patch(`/v1/pharmacy/orders/${orderId}/status`)
          .set('Authorization', as('pharmacist'))
          .send({ status });
        expect(step.status).toBe(200);
        expect(step.body.data.status).toBe(status);
      }
    });

    it('cannot approve twice or reuse an approved prescription for another order', async () => {
      const { rxId } = await rxOrder();
      await http()
        .post(`/v1/pharmacy/prescriptions/${rxId}/approve`)
        .set('Authorization', as('pharmacist'));
      const second = await http()
        .post(`/v1/pharmacy/prescriptions/${rxId}/approve`)
        .set('Authorization', as('pharmacist'));
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe('PRESCRIPTION_ALREADY_REVIEWED');

      const reuse = await placeOrder('patientA', {
        items: [line(v.rx)],
        prescriptionId: rxId,
        idempotencyKey: key(),
      });
      expect(reuse.status).toBe(422);
      expect(reuse.body.error.code).toBe('PRESCRIPTION_NOT_USABLE');
    });

    it('rejection stores a fixed reason, cancels the order and restores its stock', async () => {
      const before = await stock(v.rx);
      const { rxId, orderId } = await rxOrder('patientA', 3);
      expect(await stock(v.rx)).toBe(before - 3);

      const bad = await http()
        .post(`/v1/pharmacy/prescriptions/${rxId}/reject`)
        .set('Authorization', as('pharmacist'))
        .send({ reason: 'FREE TEXT' });
      expect(bad.status).toBe(400);
      const res = await http()
        .post(`/v1/pharmacy/prescriptions/${rxId}/reject`)
        .set('Authorization', as('pharmacist'))
        .send({ reason: 'ILLEGIBLE', note: 'Please retake the photo in good light' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'ILLEGIBLE',
        reviewedBy: ids.pharmacist,
      });
      expect(await stock(v.rx)).toBe(before);

      const order = await http().get(`/v1/orders/${orderId}`).set('Authorization', as('patientA'));
      expect(order.body.data).toMatchObject({
        status: 'CANCELLED',
        canCancel: false,
        cancellationReason: 'Prescription not accepted: the prescription was not legible.',
        prescription: {
          status: 'REJECTED',
          rejectionReason: 'ILLEGIBLE',
          reviewerNote: 'Please retake the photo in good light',
        },
      });

      // Cannot be approved afterwards, and the patient must upload a new one.
      const late = await http()
        .post(`/v1/pharmacy/prescriptions/${rxId}/approve`)
        .set('Authorization', as('pharmacist'));
      expect(late.status).toBe(409);
      const retry = await placeOrder('patientA', {
        items: [line(v.rx)],
        prescriptionId: rxId,
        idempotencyKey: key(),
      });
      expect(retry.body.error.code).toBe('PRESCRIPTION_NOT_USABLE');
    });

    it('keeps stock consistent when the customer cancels while the pharmacist approves', async () => {
      const before = await stock(v.rx);
      const { rxId, orderId } = await rxOrder('patientA', 2);
      await Promise.all([
        http()
          .post(`/v1/pharmacy/prescriptions/${rxId}/approve`)
          .set('Authorization', as('pharmacist')),
        http().patch(`/v1/orders/${orderId}/cancel`).set('Authorization', as('patientA')).send({}),
      ]);
      expect((await ds.query('SELECT status FROM orders WHERE id = $1', [orderId]))[0].status).toBe(
        'CANCELLED',
      );
      expect(await stock(v.rx)).toBe(before); // restored exactly once
    });

    it('a customer-cancelled prescription order frees the prescription to be used again', async () => {
      const rx = await upload('patientA');
      const first = await placeOrder('patientA', {
        items: [line(v.rx)],
        prescriptionId: rx.body.data.id,
        idempotencyKey: key(),
      });
      await http()
        .patch(`/v1/orders/${first.body.data.id}/cancel`)
        .set('Authorization', as('patientA'))
        .send({});
      const second = await placeOrder('patientA', {
        items: [line(v.rx)],
        prescriptionId: rx.body.data.id,
        idempotencyKey: key(),
      });
      expect(second.status).toBe(201);
    });

    it("won't let staff review their own prescription", async () => {
      // Staff cannot place orders, so build the role-drift case directly in the database.
      const [{ id: rxId }] = await ds.query(
        `INSERT INTO prescription_uploads (patient_id, storage_key, mime_type, size_bytes, sha256)
         VALUES ($1, $2, 'image/png', 10, $3) RETURNING id`,
        [ids.pharmacist, randomBytes(16).toString('hex'), 'a'.repeat(64)],
      );
      await ds.query(
        `INSERT INTO orders (user_id, status, total, delivery_address, prescription_id) VALUES ($1, 'PENDING_REVIEW', 1, 'x', $2)`,
        [ids.pharmacist, rxId],
      );
      const res = await http()
        .post(`/v1/pharmacy/prescriptions/${rxId}/approve`)
        .set('Authorization', as('pharmacist'));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CANNOT_REVIEW_OWN_PRESCRIPTION');
    });
  });

  // ── 8: authorization ───────────────────────────────────────────────────────

  describe('authorization', () => {
    it('requires authentication for orders, uploads and the pharmacy API', async () => {
      for (const [method, path] of [
        ['get', '/v1/orders'],
        ['post', '/v1/orders'],
        ['post', '/v1/orders/quote'],
        ['get', '/v1/prescription-uploads'],
        ['get', '/v1/pharmacy/orders'],
        ['get', '/v1/pharmacy/prescriptions'],
      ] as const) {
        expect((await http()[method](path)).status).toBe(401);
      }
    });

    it('keeps staff endpoints away from patients and doctors', async () => {
      const { rxId, orderId } = await rxOrder();
      for (const who of ['patientA', 'doctor'] as const) {
        const auth = as(who);
        expect((await http().get('/v1/pharmacy/orders').set('Authorization', auth)).status).toBe(
          403,
        );
        expect(
          (await http().get('/v1/pharmacy/prescriptions').set('Authorization', auth)).status,
        ).toBe(403);
        expect(
          (
            await http()
              .post(`/v1/pharmacy/prescriptions/${rxId}/approve`)
              .set('Authorization', auth)
          ).status,
        ).toBe(403);
        expect(
          (
            await http()
              .patch(`/v1/pharmacy/orders/${orderId}/status`)
              .set('Authorization', auth)
              .send({ status: 'CANCELLED' })
          ).status,
        ).toBe(403);
      }
      expect((await ds.query('SELECT status FROM orders WHERE id = $1', [orderId]))[0].status).toBe(
        'PENDING_REVIEW',
      );
      expect(
        (await ds.query('SELECT status FROM prescription_uploads WHERE id = $1', [rxId]))[0].status,
      ).toBe('PENDING');
    });

    it('stops staff and doctors from placing patient orders or uploading as patients', async () => {
      expect(
        (await placeOrder('pharmacist', { items: [line(v.plain)], idempotencyKey: key() })).status,
      ).toBe(403);
      expect((await upload('doctor')).status).toBe(403);
    });

    it("hides other users' orders, and their cancellation, behind 404", async () => {
      const mine = await placeOrder('patientA', { items: [line(v.plain)], idempotencyKey: key() });
      const id = mine.body.data.id;
      expect(
        (await http().get(`/v1/orders/${id}`).set('Authorization', as('patientB'))).status,
      ).toBe(404);
      const cancel = await http()
        .patch(`/v1/orders/${id}/cancel`)
        .set('Authorization', as('patientB'))
        .send({});
      expect(cancel.status).toBe(404);
      expect((await ds.query('SELECT status FROM orders WHERE id = $1', [id]))[0].status).toBe(
        'PLACED',
      );

      const listB = await http().get('/v1/orders').set('Authorization', as('patientB'));
      expect(listB.body.data.some((o: { id: string }) => o.id === id)).toBe(false);
    });

    it('serves prescription files only to the owner and pharmacy staff, encrypted at rest', async () => {
      const rx = await upload('patientC');
      const id = rx.body.data.id;
      expect(rx.body.data).toMatchObject({
        status: 'PENDING',
        mimeType: 'image/png',
        sizeBytes: PNG.length,
      });
      expect(JSON.stringify(rx.body)).not.toMatch(/storage|sha256|url/i);

      const binary = (res: request.Response, cb: (e: Error | null, b: Buffer) => void) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      };
      for (const who of ['patientC', 'pharmacist'] as const) {
        const res = await http()
          .get(`/v1/prescription-uploads/${id}/file`)
          .set('Authorization', as(who))
          .buffer(true)
          .parse(binary);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('image/png');
        expect(res.headers['cache-control']).toBe('private, no-store');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(Buffer.from(res.body).equals(PNG)).toBe(true);
      }
      // Other patients, doctors, anonymous callers: the same 404/403/401 they would get for a missing id.
      expect(
        (
          await http()
            .get(`/v1/prescription-uploads/${id}/file`)
            .set('Authorization', as('patientB'))
        ).status,
      ).toBe(404);
      expect(
        (await http().get(`/v1/prescription-uploads/${id}/file`).set('Authorization', as('doctor')))
          .status,
      ).toBe(403);
      expect((await http().get(`/v1/prescription-uploads/${id}/file`)).status).toBe(401);
      expect(
        (await http().get(`/v1/prescription-uploads/${id}`).set('Authorization', as('patientB')))
          .status,
      ).toBe(404);
      const listB = await http()
        .get('/v1/prescription-uploads')
        .set('Authorization', as('patientB'));
      expect(listB.body.data.some((r: { id: string }) => r.id === id)).toBe(false);

      // The stored bytes are ciphertext, in a private directory, under an unguessable name.
      const files = readdirSync(storageDir);
      expect(files.length).toBeGreaterThan(0);
      for (const f of files) {
        expect(f).toMatch(/^[a-f0-9]{32}$/);
        expect(
          readFileSync(join(storageDir, f)).includes(Buffer.from('fake-prescription-image')),
        ).toBe(false);
      }
    });

    it('rejects unsafe uploads: wrong content, oversize, missing file', async () => {
      const html = await upload(
        'patientD',
        Buffer.from('<script>alert(1)</script>'),
        'rx.png',
        'image/png',
      );
      expect(html.status).toBe(400);
      expect(html.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
      const exe = await upload(
        'patientD',
        Buffer.from('MZ\x90\x00 pretend'),
        'rx.pdf',
        'application/pdf',
      );
      expect(exe.status).toBe(400);
      const big = await upload('patientD', Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]));
      expect(big.status).toBe(413);
      const none = await http()
        .post('/v1/prescription-uploads')
        .set('Authorization', as('patientD'));
      expect(none.status).toBe(400);
    });

    it('throttles uploads per patient per day', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) statuses.push((await upload('patientD')).status);
      expect(statuses.filter((s) => s === 201).length).toBeLessThanOrEqual(10);
      expect(statuses.at(-1)).toBe(429);
    });
  });

  // ── 9 / 10: lifecycle and cancellation ─────────────────────────────────────

  describe('order lifecycle', () => {
    it('rejects invalid transitions and values', async () => {
      const { body } = await placeOrder('patientA', {
        items: [line(v.plain)],
        idempotencyKey: key(),
      });
      const id = body.data.id;
      const patch = (status: string, who: keyof typeof ids = 'pharmacist') =>
        http()
          .patch(`/v1/pharmacy/orders/${id}/status`)
          .set('Authorization', as(who))
          .send({ status });

      expect((await patch('DELIVERED')).status).toBe(409); // skipping steps
      expect((await patch('SHIPPED')).status).toBe(409);
      expect((await patch('PLACED')).status).toBe(400); // initial states are not settable
      expect((await patch('PENDING_REVIEW')).status).toBe(400);
      expect((await patch('NONSENSE')).status).toBe(400);
      expect((await patch('CONFIRMED', 'patientA')).status).toBe(403); // customers cannot set statuses
      expect((await ds.query('SELECT status FROM orders WHERE id = $1', [id]))[0].status).toBe(
        'PLACED',
      );

      expect((await patch('CONFIRMED')).status).toBe(200);
      expect((await patch('CONFIRMED')).status).toBe(409); // no repeats
      expect((await patch('PLACED')).status).toBe(400);
      expect((await patch('PROCESSING')).status).toBe(200);
      expect((await patch('SHIPPED')).status).toBe(200);
      expect((await patch('DELIVERED')).status).toBe(200);
      expect((await patch('CANCELLED')).status).toBe(409); // delivered is final
      expect((await patch('PROCESSING')).status).toBe(409);

      const final = await http()
        .get(`/v1/pharmacy/orders/${id}`)
        .set('Authorization', as('pharmacist'));
      expect(final.body.data.history.map((h: { status: string }) => h.status)).toEqual([
        'PLACED',
        'CONFIRMED',
        'PROCESSING',
        'SHIPPED',
        'DELIVERED',
      ]);
    });

    it('lists orders for staff, filtered by status, oldest first', async () => {
      const res = await http()
        .get('/v1/pharmacy/orders')
        .query({ status: 'PENDING_REVIEW' })
        .set('Authorization', as('pharmacist'));
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.every((o: { status: string }) => o.status === 'PENDING_REVIEW')).toBe(
        true,
      );
      const times = res.body.data.map((o: { createdAt: string }) => Date.parse(o.createdAt));
      expect(times).toEqual([...times].sort((a, b) => a - b));
    });

    it('restores inventory exactly once when a valid cancellation happens', async () => {
      const before = await stock(v.plain);
      const placed = await placeOrder('patientA', {
        items: [line(v.plain, 4)],
        idempotencyKey: key(),
      });
      expect(await stock(v.plain)).toBe(before - 4);
      const id = placed.body.data.id;

      const cancel = () =>
        http()
          .patch(`/v1/orders/${id}/cancel`)
          .set('Authorization', as('patientA'))
          .send({ reason: 'Ordered by mistake' });
      const first = await cancel();
      expect(first.status).toBe(200);
      expect(first.body.data).toMatchObject({
        status: 'CANCELLED',
        cancellationReason: 'Ordered by mistake',
        canCancel: false,
      });
      expect(await stock(v.plain)).toBe(before);
      expect((await cancel()).status).toBe(200); // idempotent
      expect(await stock(v.plain)).toBe(before); // not restored twice
    });

    it('blocks customer cancellation once packing starts, but lets staff cancel and restock', async () => {
      const before = await stock(v.plain);
      const placed = await placeOrder('patientA', {
        items: [line(v.plain, 2)],
        idempotencyKey: key(),
      });
      const id = placed.body.data.id;
      const staff = (status: string, note?: string) =>
        http()
          .patch(`/v1/pharmacy/orders/${id}/status`)
          .set('Authorization', as('pharmacist'))
          .send({ status, note });
      await staff('CONFIRMED');
      await staff('PROCESSING');

      const denied = await http()
        .patch(`/v1/orders/${id}/cancel`)
        .set('Authorization', as('patientA'))
        .send({});
      expect(denied.status).toBe(409);
      expect(denied.body.error.code).toBe('ORDER_NOT_CANCELLABLE');
      expect(await stock(v.plain)).toBe(before - 2);

      const done = await staff('CANCELLED', 'Out of cold-chain packaging');
      expect(done.status).toBe(200);
      expect(done.body.data).toMatchObject({
        status: 'CANCELLED',
        cancellationReason: 'Out of cold-chain packaging',
      });
      expect(await stock(v.plain)).toBe(before);
    });

    it('does not let a shipped order be cancelled by anyone', async () => {
      const placed = await placeOrder('patientA', {
        items: [line(v.plain)],
        idempotencyKey: key(),
      });
      const id = placed.body.data.id;
      for (const status of ['CONFIRMED', 'PROCESSING', 'SHIPPED']) {
        await http()
          .patch(`/v1/pharmacy/orders/${id}/status`)
          .set('Authorization', as('pharmacist'))
          .send({ status });
      }
      const before = await stock(v.plain);
      expect(
        (
          await http()
            .patch(`/v1/orders/${id}/cancel`)
            .set('Authorization', as('patientA'))
            .send({})
        ).status,
      ).toBe(409);
      expect(
        (
          await http()
            .patch(`/v1/pharmacy/orders/${id}/status`)
            .set('Authorization', as('pharmacist'))
            .send({ status: 'CANCELLED' })
        ).status,
      ).toBe(409);
      expect(await stock(v.plain)).toBe(before);
    });

    it('keeps the database constraints as a last line of defence', async () => {
      await expect(
        ds.query(`UPDATE variants SET stock_quantity = -1 WHERE id = $1`, [v.plain]),
      ).rejects.toThrow(/CHK_variants_stock_non_negative/);
      await expect(ds.query(`UPDATE orders SET payment_status = 'PAID'`)).rejects.toThrow(
        /CHK_orders_payment_status/,
      );
      await expect(
        ds.query(`UPDATE prescription_uploads SET status = 'APPROVED' WHERE status = 'PENDING'`),
      ).rejects.toThrow(/CHK_prescription_uploads_review/);
    });
  });
});
