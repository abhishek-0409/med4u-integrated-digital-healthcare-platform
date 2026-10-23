/**
 * Profile / onboarding tests against a real PostgreSQL database through the real UserController,
 * zod validation, response envelope and exception filter. Authentication is replaced by a test guard
 * reading `Authorization: Bearer test:<userId>:<role>`.
 *
 * Opt-in because it WIPES the `public` schema of the named database. Run in band, because the
 * pharmacy integration suite wipes the same database:
 *   TEST_DB_NAME=med4u_test npx jest --runInBand integration
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
import { UserModule } from './user.module';

loadEnv({ path: join(__dirname, '..', '..', '..', '.env') });

const TEST_DB = process.env.TEST_DB_NAME;
const suite = TEST_DB && TEST_DB.endsWith('_test') ? describe : describe.skip;

jest.setTimeout(120_000);

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
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Authentication required.' });
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
      useValue: { log() {}, error() {}, warn() {} },
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

suite('Profile onboarding (PostgreSQL)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let alice: string;
  let bob: string;

  const as = (id: string) => `Bearer test:${id}:patient`;
  const http = () => request(app.getHttpServer());
  const patch = (id: string, body: Record<string, unknown>) =>
    http().patch('/v1/users/me').set('Authorization', as(id)).send(body);
  const me = (id: string) => http().get('/v1/users/me').set('Authorization', as(id));

  const COMPLETE = {
    name: 'Alice Kumar',
    email: 'Alice@Example.com',
    dob: '1992-04-18',
  };

  beforeAll(async () => {
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

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        TypeOrmModule.forRoot({ ...dbOptions(), entities: ALL_ENTITIES, synchronize: false }),
        TestInfraModule,
        UserModule,
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

    // New accounts are created by OTP verification with the phone number as a placeholder name.
    const create = async (phone: string): Promise<string> => {
      const rows = await ds.query(
        `INSERT INTO users (phone, name, role) VALUES ($1, $1, 'patient') RETURNING id`,
        [phone],
      );
      return rows[0].id as string;
    };
    alice = await create('+919800000001');
    bob = await create('+919800000002');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('requires authentication', async () => {
    expect((await http().get('/v1/users/me')).status).toBe(401);
    expect((await http().patch('/v1/users/me').send({ name: 'X Y' })).status).toBe(401);
  });

  it('reports a brand-new account as incomplete', async () => {
    const res = await me(alice);
    expect(res.status).toBe(200);
    expect(res.body.data.isProfileComplete).toBe(false);
  });

  it('stays incomplete after each partial step and completes only when all required fields exist', async () => {
    let res = await patch(alice, COMPLETE);
    expect(res.status).toBe(200);
    expect(res.body.data.isProfileComplete).toBe(false);
    expect(res.body.data.email).toBe('alice@example.com'); // normalised

    res = await patch(alice, { gender: 'female' });
    expect(res.body.data.isProfileComplete).toBe(false);

    res = await patch(alice, { bloodGroup: 'O+' });
    expect(res.status).toBe(200);
    expect(res.body.data.isProfileComplete).toBe(true);
    expect(res.body.data).toMatchObject({ heightCm: null, weightKg: null });

    // The flag is computed on read, so a restarted app sees the same answer.
    expect((await me(alice)).body.data.isProfileComplete).toBe(true);
  });

  it('accepts "Unknown" blood group and "Prefer not to say" as answers', async () => {
    const res = await patch(bob, {
      name: 'Bob Rao',
      email: 'bob@example.com',
      dob: '1985-01-02',
      gender: 'prefer_not_to_say',
      bloodGroup: 'unknown',
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      gender: 'prefer_not_to_say',
      bloodGroup: 'unknown',
      isProfileComplete: true,
    });
  });

  it('stores optional height and weight, and lets them be cleared', async () => {
    let res = await patch(alice, { heightCm: 165.5, weightKg: 58 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ heightCm: 165.5, weightKg: 58 });
    res = await patch(alice, { heightCm: null, weightKg: null });
    expect(res.body.data).toMatchObject({ heightCm: null, weightKg: null });
    expect(res.body.data.isProfileComplete).toBe(true);
  });

  it.each([
    ['height too small', { heightCm: 10 }],
    ['height too large', { heightCm: 400 }],
    ['weight too small', { weightKg: 0 }],
    ['weight too large', { weightKg: 900 }],
    ['height as text', { heightCm: '170' }],
    ['future date of birth', { dob: '2999-01-01' }],
    ['impossible date', { dob: '2020-02-31' }],
    ['date older than 120 years', { dob: '1850-01-01' }],
    ['bad email', { email: 'not-an-email' }],
    ['one-letter name', { name: 'A' }],
    ['unknown gender', { gender: 'robot' }],
    ['unknown blood group', { bloodGroup: 'Z+' }],
    ['unexpected field (role escalation)', { role: 'admin' }],
    ['unexpected field (isProfileComplete)', { isProfileComplete: true }],
  ])('rejects %s on the server', async (_label, body) => {
    const res = await patch(alice, body);
    expect(res.status).toBe(400);
  });

  it('rejects an email that belongs to another account (case-insensitive)', async () => {
    const res = await patch(bob, { email: 'ALICE@example.com' });
    expect(res.status).toBe(409);
  });

  it("cannot update another user's profile: the target is always the token's user", async () => {
    // There is no :id route, and a body carrying someone else's id is rejected as an unknown field.
    expect((await patch(alice, { id: bob, name: 'Hijacked Bob' })).status).toBe(400);
    const direct = await http()
      .patch(`/v1/users/${bob}`)
      .set('Authorization', as(alice))
      .send({ name: 'Hijacked Bob' });
    expect(direct.status).toBe(404);
    const rows = await ds.query('SELECT name FROM users WHERE id = $1', [bob]);
    expect(rows[0].name).toBe('Bob Rao');
  });

  it('never leaks the push token or soft-delete columns', async () => {
    const body = (await me(alice)).body.data;
    expect(body).not.toHaveProperty('fcmToken');
    expect(body).not.toHaveProperty('deletedAt');
  });
});
