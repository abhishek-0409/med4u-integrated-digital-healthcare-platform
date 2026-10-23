/**
 * Doctor registration and verification against a real PostgreSQL database, through the real controllers,
 * services, role guard, response envelope and exception filter. Only authentication is replaced: a test guard
 * reads `Authorization: Bearer test:<userId>:<role>` instead of verifying a JWT.
 *
 * Opt-in because it needs a database and WIPES its `public` schema:
 *   TEST_DB_NAME=med4u_test npx jest doctor-application.integration       (bash)
 *   $env:TEST_DB_NAME='med4u_test'; npx jest doctor-application.integration   (PowerShell)
 * The database name must end in `_test`. Connection settings come from .env / .env.local.
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
import { LabAndMedicalRecords1714600007000 } from '../../database/migrations/1714600007000-LabAndMedicalRecords';
import { ProfileOnboarding1714600008000 } from '../../database/migrations/1714600008000-ProfileOnboarding';
import { AppointmentPayments1714600009000 } from '../../database/migrations/1714600009000-AppointmentPayments';
import { AppointmentRefundState1714600010000 } from '../../database/migrations/1714600010000-AppointmentRefundState';
import { DoctorProvenance1714600011000 } from '../../database/migrations/1714600011000-DoctorProvenance';
import { StagingFixtureFlag1714600012000 } from '../../database/migrations/1714600012000-StagingFixtureFlag';
import { DoctorApplications1714600013000 } from '../../database/migrations/1714600013000-DoctorApplications';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { ensureDemoAccounts } from '../auth/demo-seed';
import { DoctorModule } from '../doctors/doctor.module';
import { DoctorApplicationModule } from './doctor-application.module';

loadEnv({ path: join(__dirname, '..', '..', '..', '.env.local') });
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
    if (!sub)
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
      });
    req.user = { sub, role, phone: '' };
    return true;
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
        del: async () => 1,
        scan: async () => ['0', []],
      },
    },
    {
      provide: WINSTON_MODULE_NEST_PROVIDER,
      useValue: { log() {}, error: () => undefined, warn() {} },
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
  LabAndMedicalRecords1714600007000,
  ProfileOnboarding1714600008000,
  AppointmentPayments1714600009000,
  AppointmentRefundState1714600010000,
  DoctorProvenance1714600011000,
  StagingFixtureFlag1714600012000,
  DoctorApplications1714600013000,
];

const dbOptions = () => ({
  type: 'postgres' as const,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: TEST_DB,
});

const pdf = (marker = 'SECRET-CERTIFICATE-MARKER') =>
  Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from(marker), randomBytes(16)]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('png-body'),
]);

const FIELDS = {
  fullName: 'Dr Asha Verma',
  email: 'asha.verma@example.com',
  registrationNumber: 'MH/2015/12345',
  registrationCouncil: 'Maharashtra Medical Council',
  qualification: 'MBBS, MD',
  medicalCollege: 'Grant Medical College',
  specialization: 'Cardiology',
  clinicName: 'Verma Heart Clinic',
  clinicAddress: '12 Lake View Road, Kothrud',
  city: 'Pune',
  consultationMode: 'BOTH',
};

suite('Doctor applications (PostgreSQL)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let storageDir: string;

  const users = {} as Record<string, string>;
  const roles: Record<string, string> = {
    applicantA: 'patient',
    applicantB: 'patient',
    applicantC: 'patient',
    applicantD: 'patient',
    other: 'patient',
    admin: 'admin',
    doctor: 'doctor',
  };
  const as = (who: string) => `Bearer test:${users[who]}:${roles[who]}`;
  const http = () => request(app.getHttpServer());

  const submit = (
    who: string,
    fields: Record<string, string> = FIELDS,
    opts: { grad?: Buffer | null; reg?: Buffer | null; gradName?: string; regName?: string } = {},
  ) => {
    let r = http().post('/v1/doctor-applications').set('Authorization', as(who));
    for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
    if (opts.grad !== null) {
      r = r.attach('graduationCertificate', opts.grad ?? pdf('GRAD'), {
        filename: opts.gradName ?? 'degree.pdf',
        contentType: 'application/pdf',
      });
    }
    if (opts.reg !== null) {
      r = r.attach('registrationCertificate', opts.reg ?? PNG, {
        filename: opts.regName ?? 'registration.png',
        contentType: 'image/png',
      });
    }
    return r;
  };
  const mine = (who: string) =>
    http().get('/v1/doctor-applications/me').set('Authorization', as(who));
  const admin = (path: string) => `/v1/admin/doctor-applications${path}`;
  const act = (who: string, id: string, action: string, body: Record<string, unknown> = {}) =>
    http()
      .post(admin(`/${id}/${action}`))
      .set('Authorization', as(who))
      .send(body);
  const APPROVE_BODY = {
    registryCheck: 'VERIFIED_AGAINST_OFFICIAL_REGISTER',
    registrySource: 'Maharashtra Medical Council register',
    registryReference: 'Looked up 2026-10-16, entry matches name and number',
    notes: 'Certificates are legible and consistent with the register entry.',
  };
  const filesOnDisk = () => readdirSync(storageDir);
  const doctorRowsFor = async (who: string) =>
    (await ds.query('SELECT * FROM doctors WHERE user_id = $1', [users[who]])) as Array<
      Record<string, unknown>
    >;
  const userRole = async (who: string) =>
    (await ds.query('SELECT role FROM users WHERE id = $1', [users[who]]))[0].role as string;

  beforeAll(async () => {
    const admin_ = new DataSource(dbOptions());
    await admin_.initialize();
    await admin_.query('DROP SCHEMA public CASCADE');
    await admin_.query('CREATE SCHEMA public');
    await admin_.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await admin_.destroy();
    const migrator = new DataSource({ ...dbOptions(), entities: [], migrations: MIGRATIONS });
    await migrator.initialize();
    await migrator.runMigrations();
    await migrator.destroy();

    storageDir = mkdtempSync(join(tmpdir(), 'med4u-docs-'));
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              DOCUMENT_ENCRYPTION_KEY: 'test-document-key-0123456789abcdefghij',
              DOCTOR_DOCUMENT_STORAGE_DIR: storageDir,
            }),
          ],
        }),
        TypeOrmModule.forRoot({ ...dbOptions(), entities: ALL_ENTITIES, synchronize: false }),
        TestInfraModule,
        DoctorModule,
        DoctorApplicationModule,
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

    let n = 0;
    for (const who of Object.keys(roles)) {
      const rows = await ds.query(
        `INSERT INTO users (phone, name, role) VALUES ($1, $2, $3::users_role_enum) RETURNING id`,
        [`+9100000${String(100000 + ++n * 7919)}`, `Test ${who}`, roles[who]],
      );
      users[who] = rows[0].id;
    }
  });

  afterAll(async () => {
    await app?.close();
    if (storageDir) rmSync(storageDir, { recursive: true, force: true });
  });

  // ── Submission ─────────────────────────────────────────────────────────────

  describe('submission', () => {
    it('creates a PENDING_VERIFICATION application with a deadline exactly 24h after submission', async () => {
      const res = await submit('applicantA');
      expect(res.status).toBe(201);
      const a = res.body.data;
      expect(a.status).toBe('PENDING_VERIFICATION');
      expect(a.statusLabel).toBe('Pending');
      const hours = (Date.parse(a.reviewDeadlineAt) - Date.parse(a.submittedAt)) / 3_600_000;
      expect(hours).toBe(24);
      expect(a.reviewOverdue).toBe(false);
      expect(a.reviewTargetNote).toMatch(/target, not a guarantee/);
      expect(a.emailVerified).toBe(false);
      expect(a.notifications).toBe('not_configured');
      expect(a.documents).toHaveLength(2);
      // Neither storage keys nor hashes are ever exposed.
      expect(JSON.stringify(a)).not.toMatch(/storageKey|storage_key|sha256/);
    });

    it('does not promote the account or create a bookable doctor', async () => {
      expect(await userRole('applicantA')).toBe('patient');
      expect(await doctorRowsFor('applicantA')).toHaveLength(0);
      const list = await http().get('/v1/doctors');
      expect(JSON.stringify(list.body)).not.toContain('Verma');
      // A pending applicant has no doctor role: doctor-only endpoints are closed to them.
      expect(
        (await http().get('/v1/doctors/me').set('Authorization', as('applicantA'))).status,
      ).toBe(403);
      expect(
        (await http().post('/v1/doctors/register').set('Authorization', as('applicantA')).send({}))
          .status,
      ).toBe(403);
    });

    it('stores certificates encrypted and outside any public directory', async () => {
      const files = filesOnDisk();
      expect(files.length).toBeGreaterThanOrEqual(2);
      for (const f of files) {
        expect(f).toMatch(/^[a-f0-9]{32}$/);
        const raw = readFileSync(join(storageDir, f));
        expect(raw.includes(Buffer.from('GRAD'))).toBe(false);
        expect(raw.includes(Buffer.from('%PDF'))).toBe(false);
        expect(raw.subarray(0, 3).toString()).toBe('M4E');
      }
    });

    it('records a SUBMITTED audit event', async () => {
      const rows = await ds.query(
        `SELECT action, actor_role FROM doctor_application_events e JOIN doctor_applications a ON a.id = e.application_id WHERE a.user_id = $1`,
        [users.applicantA],
      );
      expect(rows).toEqual([{ action: 'SUBMITTED', actor_role: 'patient' }]);
    });

    it('rejects a second application from the same account', async () => {
      const res = await submit('applicantA', { ...FIELDS, registrationNumber: 'MH/2015/99999' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('APPLICATION_EXISTS');
    });

    it('rejects a registration number already used by another application (case-insensitive)', async () => {
      const res = await submit('applicantB', {
        ...FIELDS,
        registrationNumber: 'mh/2015/12345',
        registrationCouncil: 'MAHARASHTRA MEDICAL COUNCIL',
      });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('REGISTRATION_ALREADY_USED');
      expect(
        await ds.query('SELECT 1 FROM doctor_applications WHERE user_id = $1', [users.applicantB]),
      ).toHaveLength(0);
    });

    it.each(Object.keys(FIELDS))('requires %s', async (field) => {
      const body: Record<string, string> = { ...FIELDS, registrationNumber: `REQ/${field}/1` };
      delete body[field];
      const res = await submit('applicantB', body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('requires both documents', async () => {
      const noGrad = await submit(
        'applicantB',
        { ...FIELDS, registrationNumber: 'DOC/1' },
        { grad: null },
      );
      expect(noGrad.status).toBe(400);
      expect(noGrad.body.error.code).toBe('DOCUMENT_REQUIRED');
      const noReg = await submit(
        'applicantB',
        { ...FIELDS, registrationNumber: 'DOC/2' },
        { reg: null },
      );
      expect(noReg.status).toBe(400);
    });

    it('rejects executables, mismatched types and oversize files and leaves nothing behind', async () => {
      const before = filesOnDisk().length;
      const f = { ...FIELDS, registrationNumber: 'BAD/1' };
      const exe = await submit('applicantB', f, {
        grad: Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100)]),
        gradName: 'degree.pdf',
      });
      expect(exe.status).toBe(400);
      expect(exe.body.error.code).toBe('UNSUPPORTED_DOCUMENT_TYPE');
      const dbl = await submit('applicantB', f, { grad: pdf(), gradName: 'degree.exe.pdf' });
      expect(dbl.status).toBe(400);
      const mismatch = await submit('applicantB', f, { grad: pdf(), gradName: 'degree.png' });
      expect(mismatch.status).toBe(400);
      const big = await submit('applicantB', f, {
        grad: Buffer.concat([pdf(), Buffer.alloc(5 * 1024 * 1024)]),
      });
      expect(big.status).toBe(413);
      expect(filesOnDisk().length).toBe(before);
      expect(
        await ds.query('SELECT 1 FROM doctor_applications WHERE user_id = $1', [users.applicantB]),
      ).toHaveLength(0);
    });

    it('ignores traversal in the upload name: stored under a random key, name sanitised', async () => {
      const res = await submit(
        'applicantB',
        { ...FIELDS, registrationNumber: 'TRAV/1', registrationCouncil: 'Delhi Medical Council' },
        { gradName: '../../../etc/passwd.pdf' },
      );
      expect(res.status).toBe(201);
      const names = res.body.data.documents.map((d: { fileName: string }) => d.fileName);
      expect(names.every((n: string) => !n.includes('/') && !n.includes('..'))).toBe(true);
      expect(filesOnDisk().every((f) => /^[a-f0-9]{32}$/.test(f))).toBe(true);
    });

    it('rejects client attempts to set status or identity fields', async () => {
      const res = await submit('applicantC', {
        ...FIELDS,
        registrationNumber: 'EVIL/1',
        status: 'APPROVED',
        userId: users.admin,
      });
      expect(res.status).toBe(400);
    });

    it('is closed to non-patients', async () => {
      const res = await submit('doctor', { ...FIELDS, registrationNumber: 'DOC/ROLE/1' });
      expect(res.status).toBe(403);
    });
  });

  // ── Ownership and secure document access ──────────────────────────────────

  describe('ownership and document access', () => {
    let docId: string;
    beforeAll(async () => {
      docId = (await mine('applicantA')).body.data.documents[0].id;
    });

    it('lets the owner read their application and download their own document with safe headers', async () => {
      const res = await http()
        .get(`/v1/doctor-applications/me/documents/${docId}`)
        .set('Authorization', as('applicantA'));
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toMatch(/no-store/);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-disposition']).toMatch(
        /^attachment; filename="[a-z_]+\.(pdf|png|jpg)"$/,
      );
      expect(res.body.length ?? 1).toBeGreaterThan(0);
    });

    it("never reveals another user's application or document (404, not 403)", async () => {
      expect((await mine('other')).status).toBe(404);
      const res = await http()
        .get(`/v1/doctor-applications/me/documents/${docId}`)
        .set('Authorization', as('other'));
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('DOCUMENT_NOT_FOUND');
    });

    it('requires authentication', async () => {
      expect((await http().get('/v1/doctor-applications/me')).status).toBe(401);
      expect((await http().get(`/v1/doctor-applications/me/documents/${docId}`)).status).toBe(401);
    });

    it('rejects non-UUID document ids (no path traversal through the id)', async () => {
      const res = await http()
        .get('/v1/doctor-applications/me/documents/..%2F..%2Fetc%2Fpasswd')
        .set('Authorization', as('applicantA'));
      expect(res.status).toBe(400);
    });

    it('keeps reviewer endpoints closed to applicants, patients and doctors', async () => {
      const appId = (await mine('applicantA')).body.data.id;
      for (const who of ['applicantA', 'other', 'doctor']) {
        expect((await http().get(admin('')).set('Authorization', as(who))).status).toBe(403);
        expect(
          (
            await http()
              .get(admin(`/${appId}`))
              .set('Authorization', as(who))
          ).status,
        ).toBe(403);
        expect(
          (
            await http()
              .get(admin(`/${appId}/documents/${docId}`))
              .set('Authorization', as(who))
          ).status,
        ).toBe(403);
      }
    });
  });

  // ── Reviewer decisions ─────────────────────────────────────────────────────

  describe('applicants cannot approve or alter verification', () => {
    let appId: string;
    beforeAll(async () => {
      appId = (await mine('applicantA')).body.data.id;
    });

    it.each(['start-review', 'approve', 'reject', 'request-info'])(
      'applicant cannot call %s',
      async (action) => {
        const res = await act('applicantA', appId, action, APPROVE_BODY);
        expect(res.status).toBe(403);
      },
    );

    it('status stays pending and no doctor profile appeared', async () => {
      expect((await mine('applicantA')).body.data.status).toBe('PENDING_VERIFICATION');
      expect(await doctorRowsFor('applicantA')).toHaveLength(0);
    });

    it('an applicant who later becomes admin still cannot review their own application', async () => {
      await ds.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [users.applicantA]);
      roles.applicantA = 'admin';
      const res = await act('applicantA', appId, 'approve', APPROVE_BODY);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('SELF_REVIEW_FORBIDDEN');
      roles.applicantA = 'patient';
      await ds.query(`UPDATE users SET role = 'patient' WHERE id = $1`, [users.applicantA]);
    });

    it('the database itself refuses a self-review', async () => {
      await expect(
        ds.query(
          `UPDATE doctor_applications SET status = 'UNDER_REVIEW', reviewer_id = user_id WHERE id = $1`,
          [appId],
        ),
      ).rejects.toThrow(/CHK_doctor_applications_no_self_review/);
    });

    it('the database refuses a mismatched review deadline', async () => {
      await expect(
        ds.query(
          `UPDATE doctor_applications SET review_deadline_at = submitted_at + interval '1 hour' WHERE id = $1`,
          [appId],
        ),
      ).rejects.toThrow(/CHK_doctor_applications_deadline/);
    });

    it('the database refuses an APPROVED row without a reviewer or doctor', async () => {
      await expect(
        ds.query(`UPDATE doctor_applications SET status = 'APPROVED' WHERE id = $1`, [appId]),
      ).rejects.toThrow(/CHK_doctor_applications_decision/);
    });
  });

  describe('reviewer workflow: info request, resubmission, approval', () => {
    let appId: string;
    let firstFiles: string[];
    beforeAll(async () => {
      appId = (await mine('applicantA')).body.data.id;
    });

    it('lists the application, oldest deadline first, with the overdue flag', async () => {
      const res = await http().get(admin('')).set('Authorization', as('admin'));
      expect(res.status).toBe(200);
      const ids = res.body.data.map((a: { id: string }) => a.id);
      expect(ids).toContain(appId);
      const row = res.body.data.find((a: { id: string }) => a.id === appId);
      expect(row.reviewOverdue).toBe(false);
      expect(row).not.toHaveProperty('reviewerNotes');
    });

    it('moves to UNDER_REVIEW when a reviewer starts, and a second start conflicts', async () => {
      const res = await act('admin', appId, 'start-review');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('UNDER_REVIEW');
      expect(res.body.data.reviewerId).toBe(users.admin);
      expect((await act('admin', appId, 'start-review')).status).toBe(409);
      expect((await mine('applicantA')).body.data.statusLabel).toBe('Under Review');
    });

    it('records document views by the reviewer in the audit trail', async () => {
      const detail = await http()
        .get(admin(`/${appId}`))
        .set('Authorization', as('admin'));
      expect(detail.body.data.verificationNote).toMatch(/not proof of authenticity/);
      const doc = detail.body.data.documents[0];
      const res = await http()
        .get(admin(`/${appId}/documents/${doc.id}`))
        .set('Authorization', as('admin'));
      expect(res.status).toBe(200);
      const after = await http()
        .get(admin(`/${appId}`))
        .set('Authorization', as('admin'));
      expect(after.body.data.events.map((e: { action: string }) => e.action)).toContain(
        'DOCUMENT_VIEWED',
      );
    });

    it('requires a message when asking for more information, then shows it to the applicant only', async () => {
      expect((await act('admin', appId, 'request-info', { message: '' })).status).toBe(400);
      const res = await act('admin', appId, 'request-info', {
        message: 'The registration certificate is blurred. Please upload a clearer scan.',
        notes: 'INTERNAL: suspicious font on certificate',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('NEEDS_INFO');
      const mineRes = (await mine('applicantA')).body.data;
      expect(mineRes.status).toBe('NEEDS_INFO');
      expect(mineRes.applicantMessage).toMatch(/blurred/);
      expect(mineRes.canResubmit).toBe(true);
      expect(JSON.stringify(mineRes)).not.toMatch(/INTERNAL|suspicious|reviewerNotes|reviewerId/);
    });

    it('cannot be approved while waiting for the applicant', async () => {
      const res = await act('admin', appId, 'approve', APPROVE_BODY);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('resubmission needs a change, replaces the document, deletes the old file, and restarts the 24h target', async () => {
      const nothing = await http()
        .post('/v1/doctor-applications/me/resubmit')
        .set('Authorization', as('applicantA'));
      expect(nothing.status).toBe(400);
      expect(nothing.body.error.code).toBe('NOTHING_TO_RESUBMIT');

      firstFiles = filesOnDisk();
      const before = (await mine('applicantA')).body.data;
      const regDoc = before.documents.find(
        (d: { kind: string }) => d.kind === 'REGISTRATION_CERTIFICATE',
      );
      const res = await http()
        .post('/v1/doctor-applications/me/resubmit')
        .set('Authorization', as('applicantA'))
        .field('clinicName', 'Verma Heart & Vascular Clinic')
        .attach('registrationCertificate', pdf('REPLACEMENT'), {
          filename: 'registration-clear.pdf',
          contentType: 'application/pdf',
        });
      expect(res.status).toBe(200);
      const a = res.body.data;
      expect(a.status).toBe('PENDING_VERIFICATION');
      expect(a.clinicName).toBe('Verma Heart & Vascular Clinic');
      expect(a.resubmissionCount).toBe(1);
      expect(a.applicantMessage).toBeNull();
      expect((Date.parse(a.reviewDeadlineAt) - Date.parse(a.submittedAt)) / 3_600_000).toBe(24);
      expect(Date.parse(a.submittedAt)).toBeGreaterThan(Date.parse(before.submittedAt));
      expect(a.documents).toHaveLength(2);
      expect(
        a.documents.find((d: { kind: string }) => d.kind === 'REGISTRATION_CERTIFICATE').id,
      ).not.toBe(regDoc.id);
      // The superseded file is gone from disk and its row is marked purged.
      expect(filesOnDisk().length).toBe(firstFiles.length);
      const purged = await ds.query(
        `SELECT count(*)::int AS n FROM doctor_application_documents WHERE purged_at IS NOT NULL AND application_id = $1`,
        [appId],
      );
      expect(purged[0].n).toBe(1);
    });

    it('cannot be resubmitted again while pending', async () => {
      const res = await http()
        .post('/v1/doctor-applications/me/resubmit')
        .set('Authorization', as('applicantA'))
        .field('city', 'Mumbai');
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESUBMISSION_NOT_ALLOWED');
    });

    it('approval demands registry evidence and notes', async () => {
      expect((await act('admin', appId, 'approve', {})).status).toBe(400);
      expect(
        (
          await act('admin', appId, 'approve', {
            registryCheck: 'VERIFIED_AGAINST_OFFICIAL_REGISTER',
            notes: 'long enough notes here',
          })
        ).status,
      ).toBe(400);
      expect(await doctorRowsFor('applicantA')).toHaveLength(0);
    });

    it('approval, by a human reviewer, creates ONE verified profile and promotes the account atomically', async () => {
      const res = await act('admin', appId, 'approve', APPROVE_BODY);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('APPROVED');
      expect(res.body.data.registryCheck).toBe('VERIFIED_AGAINST_OFFICIAL_REGISTER');
      expect(res.body.data.doctorId).toBeTruthy();

      expect(await userRole('applicantA')).toBe('doctor');
      const rows = await doctorRowsFor('applicantA');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        is_verified: true,
        is_demo: false,
        is_staging_fixture: false,
        verification_status: 'verified',
        verified_by: users.admin,
        verification_method: 'manual_document_review',
        verification_reference: appId,
        registration_number: FIELDS.registrationNumber,
        registration_council: FIELDS.registrationCouncil,
      });
      expect(rows[0].consultation_fee).toBeNull();
      expect(rows[0].experience_years).toBeNull();

      // Now (and only now) the doctor is publicly visible.
      const detail = await http().get(`/v1/doctors/${rows[0].id}`);
      expect(detail.status).toBe(200);
    });

    it('the approved account can read its final status; a second decision conflicts', async () => {
      roles.applicantA = 'doctor';
      const res = await mine('applicantA');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('APPROVED');
      expect(
        (await act('admin', appId, 'reject', { reason: 'Changed my mind after approving.' }))
          .status,
      ).toBe(409);
      expect((await act('admin', appId, 'approve', APPROVE_BODY)).status).toBe(409);
      // Doctors cannot apply again, and an approved doctor cannot resubmit.
      expect(
        (
          await http()
            .post('/v1/doctor-applications/me/resubmit')
            .set('Authorization', as('applicantA'))
            .field('city', 'X')
        ).status,
      ).toBe(403);
    });

    it('keeps a complete, ordered audit trail with reviewer ids, decisions and timestamps', async () => {
      const detail = await http()
        .get(admin(`/${appId}`))
        .set('Authorization', as('admin'));
      const actions = detail.body.data.events.map((e: { action: string }) => e.action);
      expect(actions.filter((a: string) => a !== 'DOCUMENT_VIEWED')).toEqual([
        'SUBMITTED',
        'REVIEW_STARTED',
        'INFO_REQUESTED',
        'RESUBMITTED',
        'APPROVED',
      ]);
      const approved = detail.body.data.events.find(
        (e: { action: string }) => e.action === 'APPROVED',
      );
      expect(approved).toMatchObject({
        actorUserId: users.admin,
        actorRole: 'admin',
        fromStatus: 'PENDING_VERIFICATION',
        toStatus: 'APPROVED',
      });
      expect(Date.parse(approved.createdAt)).not.toBeNaN();
      const times = detail.body.data.events.map((e: { createdAt: string }) =>
        Date.parse(e.createdAt),
      );
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    });

    it('the audit trail is append-only at the database level', async () => {
      await expect(
        ds.query(`UPDATE doctor_application_events SET note = 'tampered'`),
      ).rejects.toThrow(/append-only/);
      await expect(ds.query(`DELETE FROM doctor_application_events`)).rejects.toThrow(
        /append-only/,
      );
    });
  });

  describe('rejection', () => {
    let appId: string;
    beforeAll(async () => {
      const res = await submit('applicantC', {
        ...FIELDS,
        registrationNumber: 'REJ/100',
        registrationCouncil: 'Karnataka Medical Council',
      });
      expect(res.status).toBe(201);
      appId = res.body.data.id;
    });

    it('can be decided straight from pending, shows the reason, and blocks resubmission unless allowed', async () => {
      expect((await act('admin', appId, 'reject', { reason: 'x' })).status).toBe(400);
      const res = await act('admin', appId, 'reject', {
        reason: 'The registration number could not be found in the council register.',
        notes: 'INTERNAL: searched twice',
      });
      expect(res.status).toBe(200);
      const m = (await mine('applicantC')).body.data;
      expect(m.status).toBe('REJECTED');
      expect(m.applicantMessage).toMatch(/could not be found/);
      expect(m.canResubmit).toBe(false);
      expect(JSON.stringify(m)).not.toMatch(/INTERNAL/);
      const again = await http()
        .post('/v1/doctor-applications/me/resubmit')
        .set('Authorization', as('applicantC'))
        .field('city', 'Mysuru');
      expect(again.status).toBe(409);
    });

    it('a rejected applicant has no doctor role, no profile and no doctor-app access', async () => {
      expect(await userRole('applicantC')).toBe('patient');
      expect(await doctorRowsFor('applicantC')).toHaveLength(0);
      expect(
        (await http().get('/v1/doctors/me').set('Authorization', as('applicantC'))).status,
      ).toBe(403);
    });

    it('releases the registration number for a different applicant after rejection', async () => {
      const res = await submit('applicantD', {
        ...FIELDS,
        registrationNumber: 'REJ/100',
        registrationCouncil: 'Karnataka Medical Council',
      });
      expect(res.status).toBe(201);
    });

    it('rejection with resubmission allowed lets the applicant correct and resubmit', async () => {
      const id = (await mine('applicantD')).body.data.id;
      await act('admin', id, 'reject', {
        reason: 'Please provide the correct council name.',
        allowResubmission: true,
      });
      const m = (await mine('applicantD')).body.data;
      expect(m.status).toBe('REJECTED');
      expect(m.canResubmit).toBe(true);
      const res = await http()
        .post('/v1/doctor-applications/me/resubmit')
        .set('Authorization', as('applicantD'))
        .field('registrationCouncil', 'Delhi Medical Council')
        .field('registrationNumber', 'DL/777/2012');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PENDING_VERIFICATION');
    });
  });

  describe('retention', () => {
    it('purges stored files of long-rejected applications and keeps rows and audit trail', async () => {
      const svc = app.get(require('./doctor-application.service').DoctorApplicationService);
      const appId = (await mine('applicantC')).body.data.id;
      const before = filesOnDisk().length;
      expect(await svc.purgeRejectedDocuments(90, true, new Date())).toBe(0); // too recent
      const future = new Date(Date.now() + 91 * 24 * 3_600_000);
      expect(await svc.purgeRejectedDocuments(90, true, future)).toBe(2); // dry run reports
      expect(filesOnDisk().length).toBe(before);
      expect(await svc.purgeRejectedDocuments(90, false, future)).toBe(2);
      expect(filesOnDisk().length).toBe(before - 2);
      const rows = await ds.query(
        `SELECT count(*)::int AS n FROM doctor_application_documents WHERE application_id = $1 AND purged_at IS NOT NULL`,
        [appId],
      );
      expect(rows[0].n).toBe(2);
      const detail = await http()
        .get(admin(`/${appId}`))
        .set('Authorization', as('admin'));
      expect(detail.body.data.documents).toHaveLength(0);
      expect(detail.body.data.events.length).toBeGreaterThan(0);
    });
  });

  describe('demo doctor account is isolated from real data', () => {
    it('is created as a listed, unverified demo profile without changing existing seeded doctors', async () => {
      await ds.transaction(async (em) => {
        const first = await ensureDemoAccounts(em, { patientStub: true });
        expect(first.every((o) => o.action === 'created')).toBe(true);
        const second = await ensureDemoAccounts(em, { patientStub: true });
        expect(second.every((o) => o.action === 'unchanged')).toBe(true);
      });
      const [demo] = await ds.query(
        `SELECT d.id, d.is_verified, d.is_demo, d.is_staging_fixture, d.registration_number, d.consultation_fee, d.specialization, u.name, u.role
           FROM doctors d JOIN users u ON u.id = d.user_id WHERE u.email = 'demo-doctor@demo.invalid'`,
      );
      expect(demo).toMatchObject({
        is_verified: false,
        is_demo: true,
        is_staging_fixture: false,
        registration_number: null,
        role: 'doctor',
        consultation_fee: '10.00',
        specialization: 'General Medicine',
      });
      expect(demo.name).toContain('DEMO');
      const [patient] = await ds.query(
        `SELECT is_active, name FROM users WHERE email = 'demo-patient@demo.invalid'`,
      );
      expect(patient).toMatchObject({ is_active: false });

      const list = await http().get('/v1/doctors?search=Local%20Video%20Test');
      expect(list.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: demo.id, isDemo: true, isVerified: false }),
        ]),
      );
      const detail = await http().get(`/v1/doctors/${demo.id}`);
      expect(detail.body.data).toMatchObject({
        isDemo: true,
        isVerified: false,
        consultationFee: 10,
        specialization: 'General Medicine',
      });
      expect(detail.body.data.availabilitySchedule.monday).toMatchObject({
        start: '09:00',
        end: '17:00',
      });
    });

    it('refuses to touch a real account that owns the demo phone number', async () => {
      await ds.query(
        `UPDATE users SET email = 'someone@example.com' WHERE email = 'demo-doctor@demo.invalid'`,
      );
      await expect(ds.transaction((em) => ensureDemoAccounts(em))).rejects.toThrow(
        /non-demo account/,
      );
      await ds.query(
        `UPDATE users SET email = 'demo-doctor@demo.invalid' WHERE email = 'someone@example.com'`,
      );
    });
  });

  it('never wrote a plaintext certificate marker anywhere in the document store', () => {
    for (const f of filesOnDisk()) {
      const raw = readFileSync(join(storageDir, f));
      for (const marker of ['GRAD', 'REPLACEMENT', 'SECRET-CERTIFICATE-MARKER', 'png-body']) {
        expect(raw.includes(Buffer.from(marker))).toBe(false);
      }
    }
    expect(randomUUID()).toBeTruthy();
  });
});
