/**
 * Real-doctor import and verification against a real PostgreSQL database, through the real doctor
 * controller. Opt-in because it WIPES the `public` schema of the named database (run in band):
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
import { DoctorModule } from './doctor.module';
import { DoctorImportRecord, DoctorImportRecordSchema } from './import/doctor-import.schema';
import { VerificationError, importDoctors, revokeDoctor, verifyDoctor } from './import/doctor-import.service';

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
    throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Authentication required.' });
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useValue: {
        get: async () => null,
        setex: async () => 'OK',
        scan: async () => ['0', []],
        del: async () => 0,
      },
    },
    { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: { log() {}, error() {}, warn() {} } },
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

/** Fictional test data only: these are fixtures for the importer, not real practitioners. */
const record = (over: Partial<DoctorImportRecord> = {}): DoctorImportRecord =>
  DoctorImportRecordSchema.parse({
    fullName: 'Testa Fixture',
    gender: 'female',
    specialization: 'Cardiology',
    registrationCouncil: 'Fixture State Medical Council',
    registrationNumber: 'FX-1001',
    qualifications: [{ degree: 'MBBS' }, { degree: 'MD (Medicine)', institution: 'Fixture Medical College', year: 2008 }],
    careerStartYear: 2009,
    city: 'Pune',
    source: {
      name: 'Test fixture file',
      retrievedAt: '2026-01-15',
      permission: 'Fictional fixture created for automated tests',
    },
    ...over,
  });

suite('Real doctor import and verification (PostgreSQL)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let demoId: string;

  const http = () => request(app.getHttpServer());
  const run = <T>(fn: Parameters<DataSource['transaction']>[0] extends infer _ ? (em: import('typeorm').EntityManager) => Promise<T> : never) =>
    ds.transaction(fn);
  const importNow = (records: DoctorImportRecord[]) => run((em) => importDoctors(em, records));
  const listNames = async (): Promise<string[]> =>
    (await http().get('/v1/doctors').query({ limit: 50 })).body.data.map((d: { name: string }) => d.name);
  const idByRegistration = async (n: string): Promise<string> =>
    (await ds.query(`SELECT id FROM doctors WHERE registration_number = $1`, [n]))[0].id;

  const VERIFY = {
    council: 'Fixture State Medical Council',
    number: 'FX-1001',
    registeredName: 'DR. TESTA FIXTURE',
    method: 'NMC_PORTAL_MANUAL' as const,
    reference: '2026-02-01 lookup, ticket T-1',
    by: 'Test Admin',
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
        DoctorModule,
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

    // An existing demo doctor, exactly as the seed script stores one.
    const [{ id: userId }] = await ds.query(
      `INSERT INTO users (phone, name, role) VALUES ('demo-doc-001', 'Demo Dana', 'doctor') RETURNING id`,
    );
    const [{ id }] = await ds.query(
      `INSERT INTO doctors (user_id, specialization, license_number, experience_years, consultation_fee, is_demo, is_verified, city)
       VALUES ($1, 'Cardiology', 'DEMO-DOC-001', 7, 500, true, false, 'Pune') RETURNING id`,
      [userId],
    );
    demoId = id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('imports a new real doctor as unverified, with unknowns left null', async () => {
    const [outcome] = await importNow([record()]);
    expect(outcome.action).toBe('create');
    const row = (await ds.query(`SELECT * FROM doctors WHERE registration_number = 'FX-1001'`))[0];
    expect(row).toMatchObject({
      is_demo: false,
      is_verified: false,
      verification_status: 'unverified',
      consultation_fee: null,
      experience_years: null,
      profile_source: 'Test fixture file',
      rating: '0.00',
    });
    expect(row.verified_at).toBeNull();
    // Login-less placeholder identity.
    const user = (await ds.query(`SELECT phone FROM users WHERE id = $1`, [row.user_id]))[0];
    expect(user.phone.startsWith('imp-')).toBe(true);
  });

  it('keeps unverified real doctors out of the public directory, and demo doctors in', async () => {
    const names = await listNames();
    expect(names).toContain('Demo Dana');
    expect(names).not.toContain('Testa Fixture');
    const id = await idByRegistration('FX-1001');
    expect((await http().get(`/v1/doctors/${id}`)).status).toBe(404);
  });

  it('is idempotent: re-importing the same file changes nothing and keeps ids', async () => {
    const before = await idByRegistration('FX-1001');
    const [outcome] = await importNow([record()]);
    expect(outcome).toMatchObject({ action: 'unchanged', details: [] });
    expect(await idByRegistration('FX-1001')).toBe(before);
    expect((await ds.query(`SELECT count(*)::int AS n FROM doctors WHERE is_demo = false`))[0].n).toBe(1);
  });

  it('treats spacing and case variants of the same registration as the same doctor', async () => {
    const [outcome] = await importNow([
      record({ registrationCouncil: '  fixture   state MEDICAL council ', registrationNumber: 'fx - 1001'.replace(/ /g, '') }),
    ]);
    expect(outcome.action).toBe('unchanged');
    expect((await ds.query(`SELECT count(*)::int AS n FROM doctors WHERE is_demo = false`))[0].n).toBe(1);
  });

  it('updates only the supplied fields on re-import and keeps the rest', async () => {
    const [outcome] = await importNow([record({ clinicName: 'Fixture Clinic', consultationFeeInr: 700 })]);
    expect(outcome.action).toBe('update');
    expect(outcome.details).toEqual(expect.arrayContaining(['clinicName', 'consultationFee']));
    const row = (await ds.query(`SELECT clinic_name, consultation_fee, city, career_start_year FROM doctors WHERE registration_number = 'FX-1001'`))[0];
    expect(row).toMatchObject({ clinic_name: 'Fixture Clinic', consultation_fee: '700.00', city: 'Pune', career_start_year: 2009 });
    // Same again: now fully idempotent even with a decimal fee column.
    expect((await importNow([record({ clinicName: 'Fixture Clinic', consultationFeeInr: 700 })]))[0].action).toBe('unchanged');
  });

  it('flags duplicates inside one file and refuses the whole batch via an error outcome', async () => {
    const outcomes = await importNow([
      record({ registrationNumber: 'FX-2002', fullName: 'Second Fixture' }),
      record({ registrationNumber: 'fx-2002', fullName: 'Second Fixture' }),
    ]);
    expect(outcomes.map((o) => o.action)).toEqual(['create', 'error']);
    await ds.query(`DELETE FROM doctors WHERE registration_number = 'FX-2002'`);
    await ds.query(`DELETE FROM users WHERE name = 'Second Fixture'`);
  });

  it('never touches a demo doctor, even when an import collides with its licence key', async () => {
    const before = await ds.query(`SELECT * FROM doctors WHERE id = $1`, [demoId]);
    await ds.query(`UPDATE doctors SET registration_council = 'Fixture State Medical Council', registration_number = 'DEMO-CLASH' WHERE id = $1`, [demoId]);
    const [outcome] = await importNow([record({ registrationNumber: 'DEMO-CLASH' })]);
    expect(outcome.action).toBe('error');
    await ds.query(`UPDATE doctors SET registration_council = NULL, registration_number = NULL WHERE id = $1`, [demoId]);
    const after = await ds.query(`SELECT * FROM doctors WHERE id = $1`, [demoId]);
    expect(after[0]).toEqual(before[0]);
  });

  it('refuses to verify without matching name, valid method, reference and attester', async () => {
    await expect(run((em) => verifyDoctor(em, { ...VERIFY, registeredName: 'Somebody Else' }))).rejects.toThrow(VerificationError);
    await expect(run((em) => verifyDoctor(em, { ...VERIFY, method: 'TRUST_ME' as never }))).rejects.toThrow(/method/);
    await expect(run((em) => verifyDoctor(em, { ...VERIFY, reference: '' }))).rejects.toThrow(/reference/);
    await expect(run((em) => verifyDoctor(em, { ...VERIFY, by: '' }))).rejects.toThrow(/named/);
    await expect(run((em) => verifyDoctor(em, { ...VERIFY, number: 'NOPE-1' }))).rejects.toThrow(/No imported doctor/);
    const row = (await ds.query(`SELECT is_verified FROM doctors WHERE registration_number = 'FX-1001'`))[0];
    expect(row.is_verified).toBe(false);
  });

  it('can never verify a demo profile, and the database also forbids it', async () => {
    await ds.query(`UPDATE doctors SET registration_council = 'Fixture State Medical Council', registration_number = 'DEMO-X' WHERE id = $1`, [demoId]);
    await expect(
      run((em) => verifyDoctor(em, { ...VERIFY, number: 'DEMO-X', registeredName: 'Demo Dana' })),
    ).rejects.toThrow(/Demo profiles/);
    await expect(ds.query(`UPDATE doctors SET is_verified = true WHERE id = $1`, [demoId])).rejects.toThrow(/CHK_doctors_demo_never_verified/);
    await ds.query(`UPDATE doctors SET registration_council = NULL, registration_number = NULL WHERE id = $1`, [demoId]);
  });

  it('the database refuses a "verified" status without evidence', async () => {
    await expect(
      ds.query(`UPDATE doctors SET verification_status = 'verified' WHERE registration_number = 'FX-1001'`),
    ).rejects.toThrow(/CHK_doctors_verified_evidence/);
  });

  it('after a recorded successful check the doctor is listed with sourced, honest details', async () => {
    await run((em) => verifyDoctor(em, VERIFY, new Date('2026-02-01T10:00:00Z')));
    expect(await listNames()).toContain('Testa Fixture');

    const id = await idByRegistration('FX-1001');
    const detail = (await http().get(`/v1/doctors/${id}`)).body.data;
    expect(detail).toMatchObject({
      isVerified: true,
      isDemo: false,
      consultationFee: 700,
      verification: { status: 'verified', method: 'NMC_PORTAL_MANUAL' },
      registration: { council: 'Fixture State Medical Council', number: 'FX-1001' },
      source: { name: 'Test fixture file', retrievedAt: '2026-01-15' },
      experienceBasis: 'career_start',
      rating: 0,
      reviewCount: 0,
    });
    expect(detail.experienceYears).toBe(new Date().getUTCFullYear() - 2009);
    expect(detail.education[0]).toMatchObject({ degree: 'MBBS', institution: null, year: null });
    expect(detail).not.toHaveProperty('licenseNumber');
  });

  it('shows demo doctors as demo, with no registration or source claims', async () => {
    const detail = (await http().get(`/v1/doctors/${demoId}`)).body.data;
    expect(detail).toMatchObject({ isDemo: true, isVerified: false, registration: null, source: null, experienceBasis: 'demo' });
  });

  it('a name change on a verified profile resets its verification', async () => {
    const outcomes = await importNow([record({ fullName: 'Testa Renamed', clinicName: 'Fixture Clinic', consultationFeeInr: 700 })]);
    expect(outcomes[0].action).toBe('update');
    expect(outcomes[0].warnings.join()).toMatch(/verification was reset/);
    expect((await listNames())).not.toContain('Testa Renamed');
  });

  it('verification can be withdrawn, hiding the doctor again', async () => {
    await run((em) => verifyDoctor(em, { ...VERIFY, registeredName: 'Testa Renamed' }));
    expect(await listNames()).toContain('Testa Renamed');
    await run((em) => revokeDoctor(em, VERIFY.council, VERIFY.number, 'rejected'));
    expect(await listNames()).not.toContain('Testa Renamed');
    const row = (await ds.query(`SELECT verification_status, verified_at FROM doctors WHERE registration_number = 'FX-1001'`))[0];
    expect(row).toMatchObject({ verification_status: 'rejected', verified_at: null });
  });

  it('database enforces one doctor per registration', async () => {
    const [{ id: userId }] = await ds.query(
      `INSERT INTO users (phone, name, role) VALUES ('imp-dupe', 'Dupe', 'doctor') RETURNING id`,
    );
    await expect(
      ds.query(
        `INSERT INTO doctors (user_id, specialization, license_number, registration_council, registration_number)
         VALUES ($1, 'Cardiology', 'REG-DUPE', 'FIXTURE STATE MEDICAL COUNCIL', 'fx-1001')`,
        [userId],
      ),
    ).rejects.toThrow(/UQ_doctors_registration/);
  });
});
