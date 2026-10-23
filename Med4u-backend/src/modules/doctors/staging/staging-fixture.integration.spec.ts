/**
 * Staging fixture against a real PostgreSQL database: idempotency, refusal to touch other accounts, the
 * database constraints that keep a fixture honest, and who may book it. Opt-in because it WIPES the `public`
 * schema of the named database (run in band):
 *   TEST_DB_NAME=med4u_test npx jest --runInBand integration
 */
import { config as loadEnv } from 'dotenv';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { ALL_ENTITIES } from '../../../database/database.module';
import { InitialSchema1714600000000 } from '../../../database/migrations/1714600000000-InitialSchema';
import { AddMedicalHistories1714600001000 } from '../../../database/migrations/1714600001000-AddMedicalHistories';
import { PharmacyAndDoctorSchema1714600002000 } from '../../../database/migrations/1714600002000-PharmacyAndDoctorSchema';
import { AppointmentBookingIntegrity1714600003000 } from '../../../database/migrations/1714600003000-AppointmentBookingIntegrity';
import { CatalogOrdersAndDemoData1714600004000 } from '../../../database/migrations/1714600004000-CatalogOrdersAndDemoData';
import { AppointmentIntervalsAndFeeSnapshot1714600005000 } from '../../../database/migrations/1714600005000-AppointmentIntervalsAndFeeSnapshot';
import { PharmacyFulfilment1714600006000 } from '../../../database/migrations/1714600006000-PharmacyFulfilment';
import { ProfileOnboarding1714600008000 } from '../../../database/migrations/1714600008000-ProfileOnboarding';
import { AppointmentPayments1714600009000 } from '../../../database/migrations/1714600009000-AppointmentPayments';
import { AppointmentRefundState1714600010000 } from '../../../database/migrations/1714600010000-AppointmentRefundState';
import { DoctorProvenance1714600011000 } from '../../../database/migrations/1714600011000-DoctorProvenance';
import { StagingFixtureFlag1714600012000 } from '../../../database/migrations/1714600012000-StagingFixtureFlag';
import { Appointment } from '../../../database/entities/appointment.entity';
import { Doctor } from '../../../database/entities/doctor.entity';
import { User, UserRole } from '../../../database/entities/user.entity';
import { AppointmentService } from '../../appointments/appointment.service';
import { addDays, todayInClinic } from '../../appointments/appointment-time.util';
import { DoctorRepository } from '../doctor.repository';
import { TimeSlotRepository } from '../time-slot.repository';
import {
  FixtureDryRun,
  STAGING_DOCTOR_EMAIL,
  STAGING_DOCTOR_LICENSE,
  STAGING_PATIENT_EMAIL,
  StagingFixtureError,
  ensureStagingFixtures,
} from './staging-fixture';

loadEnv({ path: join(__dirname, '..', '..', '..', '..', '.env') });

const TEST_DB = process.env.TEST_DB_NAME;
const suite = TEST_DB && TEST_DB.endsWith('_test') ? describe : describe.skip;
jest.setTimeout(120_000);

const MIGRATIONS = [
  InitialSchema1714600000000,
  AddMedicalHistories1714600001000,
  PharmacyAndDoctorSchema1714600002000,
  AppointmentBookingIntegrity1714600003000,
  CatalogOrdersAndDemoData1714600004000,
  AppointmentIntervalsAndFeeSnapshot1714600005000,
  PharmacyFulfilment1714600006000,
  ProfileOnboarding1714600008000,
  AppointmentPayments1714600009000,
  AppointmentRefundState1714600010000,
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

const PHONES = { doctorPhone: '+919000000001', patientPhone: '+919000000002' };

/** Runs the fixture in its own transaction, like the CLI does. */
const run = (ds: DataSource, phones = PHONES) => ds.transaction((em) => ensureStagingFixtures(em, phones));

const withEnv = async <T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> => {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) saved[k] = process.env[k];
  Object.assign(process.env, vars);
  for (const [k, v] of Object.entries(vars)) if (v === undefined) delete process.env[k];
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
};
const STAGING_ON = { NODE_ENV: 'development', STAGING_FIXTURES_ENABLED: 'true' };

suite('Staging video fixture (PostgreSQL)', () => {
  let ds: DataSource;
  let doctorRepo: DoctorRepository;
  let appointments: AppointmentService;
  let realPatientId: string;
  let tomorrow: string;

  const razorpayStub = {
    configuration: { enabled: true, keyId: 'rzp_test_stub' },
    createOrder: async (amount: number, receipt: string) => ({
      id: `order_stub_${receipt.slice(0, 8)}`,
      amount,
      currency: 'INR',
      status: 'created',
    }),
  };
  const redisStub = { del: async () => 1, get: async () => null, setex: async () => 'OK', scan: async () => ['0', []] };

  const fixtureDoctor = async () => (await ds.getRepository(Doctor).findOneOrFail({ where: { licenseNumber: STAGING_DOCTOR_LICENSE } }));
  const slotFor = async (doctor: Doctor, hhmm: string) => {
    await new TimeSlotRepository(ds.getRepository((await import('../../../database/entities/time-slot.entity')).TimeSlot)).ensureSlotsForDate(doctor, tomorrow);
    const rows = await ds.query(`SELECT id FROM time_slots WHERE doctor_id = $1 AND date = $2 AND start_time = $3`, [doctor.id, tomorrow, `${hhmm}:00`]);
    return rows[0].id as string;
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

    ds = new DataSource({ ...dbOptions(), entities: ALL_ENTITIES, synchronize: false });
    await ds.initialize();
    doctorRepo = new DoctorRepository(ds.getRepository(Doctor));
    appointments = new AppointmentService(ds.getRepository(Appointment), ds, redisStub as never, razorpayStub as never);
    tomorrow = addDays(todayInClinic(), 1);

    // An unrelated, ordinary patient: must never be able to reach the fixture doctor.
    const [{ id }] = await ds.query(
      `INSERT INTO users (phone, name, email, role) VALUES ('+919111111111', 'Real Looking Patient', 'patient@example.invalid', 'patient') RETURNING id`,
    );
    realPatientId = id;
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  it('dry run writes nothing', async () => {
    await expect(
      ds.transaction(async (em) => {
        const out = await ensureStagingFixtures(em, PHONES);
        throw new FixtureDryRun(out);
      }),
    ).rejects.toBeInstanceOf(FixtureDryRun);
    expect((await ds.query(`SELECT count(*)::int AS n FROM users WHERE email LIKE '%@staging.invalid'`))[0].n).toBe(0);
    expect((await ds.query(`SELECT count(*)::int AS n FROM doctors WHERE is_staging_fixture`))[0].n).toBe(0);
  });

  it('creates two separate synthetic accounts and an unverified fixture doctor with no registration', async () => {
    const outcomes = await run(ds);
    expect(outcomes.map((o) => `${o.record}:${o.action}`)).toEqual(['doctor account:create', 'patient account:create', 'doctor profile:create']);

    const users = await ds.query(`SELECT phone, email, role, name FROM users WHERE email LIKE '%@staging.invalid' ORDER BY email`);
    expect(users).toEqual([
      { phone: PHONES.doctorPhone, email: STAGING_DOCTOR_EMAIL, role: 'doctor', name: expect.stringContaining('fictional') },
      { phone: PHONES.patientPhone, email: STAGING_PATIENT_EMAIL, role: 'patient', name: expect.stringContaining('fictional') },
    ]);

    const d = (await ds.query(`SELECT * FROM doctors WHERE license_number = $1`, [STAGING_DOCTOR_LICENSE]))[0];
    expect(d).toMatchObject({
      is_staging_fixture: true,
      is_demo: false,
      is_verified: false,
      verification_status: 'unverified',
      registration_number: null,
      registration_council: null,
      verified_at: null,
      verification_method: null,
      consultation_mode: 'ONLINE',
    });
    expect(Number(d.consultation_fee)).toBe(10);
  });

  it('is idempotent: a second run changes nothing and keeps every id', async () => {
    const before = await ds.query(`SELECT id FROM users WHERE email LIKE '%@staging.invalid' ORDER BY email`);
    const doctorBefore = (await fixtureDoctor()).id;
    const outcomes = await run(ds);
    expect(outcomes.every((o) => o.action === 'unchanged')).toBe(true);
    expect(await ds.query(`SELECT id FROM users WHERE email LIKE '%@staging.invalid' ORDER BY email`)).toEqual(before);
    expect((await fixtureDoctor()).id).toBe(doctorBefore);
    expect((await ds.query(`SELECT count(*)::int AS n FROM doctors WHERE is_staging_fixture`))[0].n).toBe(1);
  });

  it('repairs drift in fixture-owned fields only, and reports it', async () => {
    await ds.query(`UPDATE doctors SET consultation_fee = 99, city = 'Elsewhere' WHERE license_number = $1`, [STAGING_DOCTOR_LICENSE]);
    const outcomes = await run(ds);
    const profile = outcomes.find((o) => o.record === 'doctor profile');
    expect(profile?.action).toBe('update');
    expect(profile?.details).toEqual(expect.arrayContaining(['consultationFee', 'city']));
    expect(Number((await fixtureDoctor()).consultationFee)).toBe(10);
  });

  it('refuses to touch an existing account that is not the fixture, whatever its phone', async () => {
    const before = await ds.query(`SELECT id, name, role, email FROM users WHERE id = $1`, [realPatientId]);
    await expect(run(ds, { doctorPhone: '+919111111111', patientPhone: PHONES.patientPhone })).rejects.toThrow(StagingFixtureError);
    await expect(run(ds, { doctorPhone: PHONES.doctorPhone, patientPhone: '+919111111111' })).rejects.toThrow(/not the patient account/);
    expect(await ds.query(`SELECT id, name, role, email FROM users WHERE id = $1`, [realPatientId])).toEqual(before);
  });

  it('refuses to re-point an existing fixture account to a different phone number', async () => {
    await expect(run(ds, { doctorPhone: '+919000000009', patientPhone: PHONES.patientPhone })).rejects.toThrow(/never re-points/);
    expect((await ds.query(`SELECT phone FROM users WHERE email = $1`, [STAGING_DOCTOR_EMAIL]))[0].phone).toBe(PHONES.doctorPhone);
  });

  it('refuses a licence key or doctor profile that belongs to something else, leaving it untouched', async () => {
    const [{ id: otherUser }] = await ds.query(`INSERT INTO users (phone, name, role) VALUES ('+919222222222', 'Other Doctor', 'doctor') RETURNING id`);
    await ds.query(`INSERT INTO doctors (user_id, specialization, license_number) VALUES ($1, 'Cardiology', 'SOME-OTHER-KEY')`, [otherUser]);
    const rowBefore = (await ds.query(`SELECT * FROM doctors WHERE user_id = $1`, [otherUser]))[0];
    // a different phone for the doctor account => a fixture-email conflict, not a silent reuse
    await expect(run(ds, { doctorPhone: '+919222222222', patientPhone: PHONES.patientPhone })).rejects.toThrow(StagingFixtureError);
    expect((await ds.query(`SELECT * FROM doctors WHERE user_id = $1`, [otherUser]))[0]).toEqual(rowBefore);
  });

  it('the database refuses a fixture that is verified, a demo, or carries a registration', async () => {
    const id = (await fixtureDoctor()).id;
    await expect(ds.query(`UPDATE doctors SET is_verified = true WHERE id = $1`, [id])).rejects.toThrow(/CHK_doctors_staging_fixture_honest/);
    await expect(ds.query(`UPDATE doctors SET is_demo = true WHERE id = $1`, [id])).rejects.toThrow(/CHK_doctors_staging_fixture_honest/);
    await expect(
      ds.query(`UPDATE doctors SET registration_number = 'MH-123', registration_council = 'Some Council' WHERE id = $1`, [id]),
    ).rejects.toThrow(/CHK_doctors_staging_fixture_honest/);
  });

  describe('listing and booking eligibility', () => {
    it('hides the fixture everywhere unless development opted in', async () => {
      const id = (await fixtureDoctor()).id;
      await withEnv({ NODE_ENV: 'test', STAGING_FIXTURES_ENABLED: 'true' }, async () => {
        const [rows] = await doctorRepo.findAll({ sortBy: 'rating', skip: 0, take: 50 });
        expect(rows.find((r) => r.id === id)).toBeUndefined();
        await expect(doctorRepo.requireVerifiedById(id)).rejects.toThrow(/not found/i);
      });
      await withEnv({ NODE_ENV: 'development', STAGING_FIXTURES_ENABLED: undefined }, async () => {
        const [rows] = await doctorRepo.findAll({ sortBy: 'rating', skip: 0, take: 50 });
        expect(rows.find((r) => r.id === id)).toBeUndefined();
      });
      await withEnv({ NODE_ENV: 'production', STAGING_FIXTURES_ENABLED: 'true' }, async () => {
        const [rows] = await doctorRepo.findAll({ sortBy: 'rating', skip: 0, take: 50 });
        expect(rows.find((r) => r.id === id)).toBeUndefined();
      });
    });

    it('lists it, labelled as a staging fixture and never as verified, when development opted in', async () => {
      await withEnv(STAGING_ON, async () => {
        const [rows] = await doctorRepo.findAll({ sortBy: 'rating', skip: 0, take: 50 });
        const item = doctorRepo.toListItem(rows.find((r) => r.licenseNumber === STAGING_DOCTOR_LICENSE) as Doctor);
        expect(item).toMatchObject({ isStagingFixture: true, isVerified: false, isDemo: false, consultationFee: 10 });
        const detail = doctorRepo.toPublicDetail(await doctorRepo.requireVerifiedById(item.id));
        expect(detail.registration).toBeNull();
        expect(detail.verification).toMatchObject({ status: 'unverified', verifiedAt: null, method: null });
      });
    });

    it('lets only a staging account reserve a slot; ordinary users are refused', async () => {
      const doctor = await fixtureDoctor();
      const slotId = await slotFor(doctor, '12:00');
      const stagingPatientId = (await ds.query(`SELECT id FROM users WHERE email = $1`, [STAGING_PATIENT_EMAIL]))[0].id;

      await withEnv(STAGING_ON, async () => {
        await expect(appointments.createPaymentOrder(realPatientId, { doctorId: doctor.id, slotId })).rejects.toMatchObject({
          response: expect.objectContaining({ code: 'STAGING_DOCTOR_RESTRICTED' }),
        });
        expect((await ds.query(`SELECT count(*)::int AS n FROM appointments WHERE slot_id = $1`, [slotId]))[0].n).toBe(0);

        const order = await appointments.createPaymentOrder(stagingPatientId, { doctorId: doctor.id, slotId });
        expect(order).toMatchObject({ keyId: 'rzp_test_stub', amount: 1000, currency: 'INR' });
        const appt = (await ds.query(`SELECT status, payment_status, patient_id FROM appointments WHERE slot_id = $1`, [slotId]))[0];
        expect(appt).toMatchObject({ status: 'pending', payment_status: 'PENDING', patient_id: stagingPatientId });
      });
    });

    it('refuses everyone, as "not found", when the gate is off', async () => {
      const doctor = await fixtureDoctor();
      const slotId = await slotFor(doctor, '12:10');
      const stagingPatientId = (await ds.query(`SELECT id FROM users WHERE email = $1`, [STAGING_PATIENT_EMAIL]))[0].id;
      for (const env of [{ NODE_ENV: 'production', STAGING_FIXTURES_ENABLED: 'true' }, { NODE_ENV: 'development', STAGING_FIXTURES_ENABLED: undefined }, { NODE_ENV: 'test', STAGING_FIXTURES_ENABLED: 'true' }]) {
        await withEnv(env, async () => {
          await expect(appointments.createPaymentOrder(stagingPatientId, { doctorId: doctor.id, slotId })).rejects.toMatchObject({
            response: expect.objectContaining({ code: 'DOCTOR_NOT_FOUND' }),
          });
        });
      }
    });

    it('the fixture doctor cannot book themselves, and a doctor-role account is not a patient account', async () => {
      const doctor = await fixtureDoctor();
      const slotId = await slotFor(doctor, '12:20');
      await withEnv(STAGING_ON, async () => {
        await expect(appointments.createPaymentOrder(doctor.userId, { doctorId: doctor.id, slotId })).rejects.toBeDefined();
      });
      const u = await ds.getRepository(User).findOneOrFail({ where: { id: doctor.userId } });
      expect(u.role).toBe(UserRole.DOCTOR);
    });

    it('does not change who can be booked among ordinary doctors', async () => {
      const [{ id: userId }] = await ds.query(`INSERT INTO users (phone, name, role) VALUES ('+919333333333', 'Plain Unverified', 'doctor') RETURNING id`);
      const [{ id }] = await ds.query(`INSERT INTO doctors (user_id, specialization, license_number) VALUES ($1, 'ENT', 'PLAIN-1') RETURNING id`, [userId]);
      await withEnv(STAGING_ON, async () => {
        const [rows] = await doctorRepo.findAll({ sortBy: 'rating', skip: 0, take: 50 });
        expect(rows.find((r) => r.id === id)).toBeUndefined();
        await expect(doctorRepo.requireVerifiedById(id)).rejects.toThrow(/not found/i);
      });
    });
  });
});
