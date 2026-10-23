import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FindOperator } from 'typeorm';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { Appointment, AppointmentStatus } from '../../database/entities/appointment.entity';
import { ClinicalPrescription, ClinicalPrescriptionStatus } from '../../database/entities/clinical-prescription.entity';
import { ClinicalPrescriptionEvent } from '../../database/entities/clinical-prescription-event.entity';
import { Doctor } from '../../database/entities/doctor.entity';
import { Notification } from '../../database/entities/notification.entity';
import { NotificationOutbox } from '../../database/entities/notification-outbox.entity';
import { UserRole } from '../../database/entities/user.entity';
import { Variant } from '../../database/entities/variant.entity';
import { DevicePushToken } from '../../database/entities/device-push-token.entity';
import { PushDeliveryTicket } from '../../database/entities/push-delivery-ticket.entity';
import {
  DoctorPrescriptionController,
  PatientPrescriptionController,
} from './clinical-prescription.controller';
import { ClinicalPrescriptionService } from './clinical-prescription.service';
import { addDays, todayInClinic } from '../appointments/appointment-time.util';
import { HOSTING_MARKERS } from '../doctors/staging/staging-fixture';
import { SaveDraftDto, SaveDraftSchema } from './dto/clinical-prescription.dto';
import axios from 'axios';

// ── A small in-memory stand-in for the database ─────────────────────────────────
// It models what the service relies on: row lookups, a serialised transaction (like a row lock) and inserts.

type Row = Record<string, any>;
let seq = 0;
const newId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = row[key];
    if (expected instanceof FindOperator) {
      const op = expected as any;
      if (op.type === 'in') return (op.value as unknown[]).includes(actual);
      if (op.type === 'not')
        return op.child?.type === 'isNull' ? actual != null : actual !== op.value;
      return true;
    }
    return actual === expected;
  });
}

class FakeDb {
  tables = new Map<unknown, Row[]>();
  private chain: Promise<unknown> = Promise.resolve();

  rows(entity: unknown): Row[] {
    if (!this.tables.has(entity)) this.tables.set(entity, []);
    return this.tables.get(entity)!;
  }

  private decorate(entity: unknown, row: Row): Row {
    const out: Row = { ...row };
    if (entity === ClinicalPrescription) {
      const appointment = this.rows(Appointment).find((a) => a.id === row.appointmentId);
      out.appointment = appointment;
      out.patient = appointment?.patient;
    }
    return out;
  }

  findOne = async (entity: unknown, opts: Row = {}) => {
    const found = this.rows(entity).find(
      (r) => matches(r, opts.where) && (opts.withDeleted || !r.deletedAt),
    );
    if (!found) return null;
    return entity === ClinicalPrescription
      ? Object.assign(this.liveRef(found), this.relationsOf(found))
      : this.decorate(entity, found);
  };

  private relationsOf(row: Row): Row {
    const appointment = this.rows(Appointment).find((a) => a.id === row.appointmentId);
    return { appointment, patient: appointment?.patient };
  }

  /** Returns the stored object itself for prescriptions so in-place mutation + save behaves like an ORM. */
  private liveRef(row: Row): Row {
    return Object.assign(Object.create(null), row, { __ref: row }) as Row;
  }

  find = async (entity: unknown, opts: Row = {}) =>
    this.rows(entity)
      .filter((r) => matches(r, opts.where) && (opts.withDeleted || !r.deletedAt))
      .map((r) => this.decorate(entity, r));

  findAndCount = async (entity: unknown, opts: Row = {}) => {
    const all = this.rows(entity).filter((r) => matches(r, opts.where) && !r.deletedAt);
    const page = all.slice(opts.skip ?? 0, (opts.skip ?? 0) + (opts.take ?? all.length));
    return [page.map((r) => this.decorate(entity, r)), all.length] as const;
  };

  create = (_entity: unknown, data: Row) => ({ ...data });

  save = async (entity: unknown, data: Row) => {
    const { __ref, ...withRelations } = data;
    const plain = { ...withRelations };
    delete plain.appointment;
    delete plain.patient;
    const rows = this.rows(entity);
    const target = __ref ?? rows.find((r) => r.id === plain.id);
    const now = new Date();
    if (target) {
      Object.assign(target, plain, { updatedAt: now });
      return this.liveRef(target);
    }
    const created = { id: newId(), createdAt: now, updatedAt: now, deletedAt: null, ...plain };
    rows.push(created);
    return entity === ClinicalPrescription ? this.liveRef(created) : { ...created };
  };

  softRemove = async (_entity: unknown, data: Row) => {
    const target = data.__ref ?? this.rows(ClinicalPrescription).find((r) => r.id === data.id);
    target.deletedAt = new Date();
    return data;
  };

  transaction = async <T>(cb: (m: unknown) => Promise<T>): Promise<T> => {
    const run = this.chain.then(() => cb(this));
    this.chain = run.catch(() => undefined);
    return run;
  };

  repo(entity: unknown) {
    return {
      findOne: (o: Row) => this.findOne(entity, o),
      find: (o: Row) => this.find(entity, o),
      findAndCount: (o: Row) => this.findAndCount(entity, o),
      upsert: async (value: Row, keys: string[]) => {
        const existing = this.rows(entity).find((r) => keys.every((k) => r[k] === value[k]));
        if (existing) Object.assign(existing, value);
        else this.rows(entity).push({ id: newId(), ...value });
      },
      delete: async (where: Row) => {
        const rows = this.rows(entity);
        const index = rows.findIndex((r) => matches(r, where));
        if (index >= 0) rows.splice(index, 1);
      },
      update: async (where: Row, data: Row) => {
        const existing = this.rows(entity).find((r) => matches(r, where));
        if (existing) Object.assign(existing, data);
      },
      save: async (value: Row) => {
        const created = { id: newId(), createdAt: new Date(), ...value };
        this.rows(entity).push(created);
        return created;
      },
    };
  }
}

// ── Fixtures ────────────────────────────────────────────────────────────────────

const FOLLOW_UP = addDays(todayInClinic(), 30);
const DOCTOR_USER = 'user-doctor-1';
const OTHER_DOCTOR_USER = 'user-doctor-2';
const PATIENT = 'patient-1';
const OTHER_PATIENT = 'patient-2';

const medicine = (over: Row = {}) => ({
  name: 'Paracetamol',
  strength: '500 mg',
  dosageForm: 'tablet',
  dose: '1 tablet',
  route: 'oral',
  frequency: 'Three times daily',
  durationValue: 5,
  durationUnit: 'days',
  quantity: 15,
  quantityUnit: 'tablets',
  timing: ['morning', 'night'],
  foodRelation: 'after_food',
  instructions: 'Take with water',
  ...over,
});

const draftBody = (over: Row = {}): SaveDraftDto =>
  SaveDraftSchema.parse({
    diagnosis: 'Viral fever',
    medicines: [medicine()],
    additionalInstructions: 'Rest and fluids',
    warnings: 'Avoid alcohol',
    followUpDate: FOLLOW_UP,
    ...over,
  });

function setup(opts: { appointment?: Row; doctor?: Row } = {}) {
  const db = new FakeDb();
  const doctor = {
    id: 'doc-1',
    userId: DOCTOR_USER,
    specialization: 'Cardiology',
    licenseNumber: 'LIC-1',
    clinicName: 'Heart Clinic',
    isVerified: true,
    isDemo: false,
    isStagingFixture: false,
    verificationStatus: 'verified',
    registrationNumber: 'REG-12345',
    registrationCouncil: 'State Medical Council',
    user: { name: 'Dr. Asha Rao' },
    ...opts.doctor,
  };
  const otherDoctor = {
    ...doctor,
    id: 'doc-2',
    userId: OTHER_DOCTOR_USER,
    licenseNumber: 'LIC-2',
    user: { name: 'Dr. Other' },
  };
  db.rows(Doctor).push(doctor, otherDoctor);
  db.rows(Appointment).push({
    id: 'appt-1',
    doctorId: 'doc-1',
    patientId: PATIENT,
    status: AppointmentStatus.COMPLETED,
    doctor,
    patient: { id: PATIENT, name: 'Pia Patient', dob: '1990-01-01', gender: 'female' },
    slot: { date: '2026-10-20', startTime: '10:00:00', endTime: '10:30:00' },
    ...opts.appointment,
  });
  const service = new ClinicalPrescriptionService(
    db as any,
    db.repo(ClinicalPrescription) as any,
    db.repo(ClinicalPrescriptionEvent) as any,
    db.repo(Appointment) as any,
    db.repo(Doctor) as any,
    db.repo(Variant) as any,
    db.repo(DevicePushToken) as any,
    db.repo(PushDeliveryTicket) as any,
    { matchPrescription: jest.fn() } as any,
  );
  const events = () => db.rows(ClinicalPrescriptionEvent).map((e) => e.action);
  return { db, service, events, doctor };
}

async function issued(ctx: ReturnType<typeof setup>) {
  const draft = await ctx.service.saveDraft(DOCTOR_USER, 'appt-1', draftBody());
  const result = await ctx.service.issue(DOCTOR_USER, draft.id, { revision: draft.revision });
  return result.prescription;
}

const list = (service: ClinicalPrescriptionService, patient = PATIENT) =>
  service.listMine(patient, { page: 1, limit: 20 });

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('ClinicalPrescriptionService', () => {
  describe('drafts', () => {
    it('creates a draft that is not issued, and stays linked to the right patient, doctor and appointment', async () => {
      const { service, db, events } = setup();
      const draft = await service.saveDraft(DOCTOR_USER, 'appt-1', draftBody());
      expect(draft).toMatchObject({ status: 'draft', version: 1, revision: 1, issuedAt: null });
      const stored = db.rows(ClinicalPrescription)[0];
      expect(stored).toMatchObject({
        appointmentId: 'appt-1',
        doctorId: 'doc-1',
        patientId: PATIENT,
      });
      expect(stored.issuedBy).toBeUndefined();
      expect(events()).toEqual(['draft_created']);
      expect(db.rows(Notification)).toHaveLength(0);
      expect(db.rows(NotificationOutbox)).toHaveLength(0);
    });

    it('edits the same draft in place and bumps the revision only when content changed', async () => {
      const { service, db, events } = setup();
      const first = await service.saveDraft(DOCTOR_USER, 'appt-1', draftBody());
      const retry = await service.saveDraft(DOCTOR_USER, 'appt-1', draftBody());
      expect(retry.id).toBe(first.id);
      expect(retry.revision).toBe(1);
      const edited = await service.saveDraft(
        DOCTOR_USER,
        'appt-1',
        draftBody({
          medicines: [medicine({ quantity: 20 }), medicine({ name: 'ORS', dosageForm: 'powder' })],
        }),
      );
      expect(edited.id).toBe(first.id);
      expect(edited.revision).toBe(2);
      expect(edited.medicines).toHaveLength(2);
      expect(db.rows(ClinicalPrescription)).toHaveLength(1);
      expect(events()).toEqual(['draft_created', 'draft_updated']);
    });

    it('rejects an older autosave revision after a newer edit has been saved', async () => {
      const { service } = setup();
      const first = await service.saveDraft(DOCTOR_USER, 'appt-1', draftBody());
      const newer = await service.saveDraft(DOCTOR_USER, 'appt-1', { ...draftBody({ diagnosis: 'Updated assessment' }), baseRevision: first.revision });
      await expect(service.saveDraft(DOCTOR_USER, 'appt-1', { ...draftBody({ diagnosis: 'Late stale write' }), baseRevision: first.revision }))
        .rejects.toMatchObject({ response: expect.objectContaining({ code: 'DRAFT_REVISION_CHANGED', revision: newer.revision }) });
    });

    it('lets a medicine be removed before issuing', async () => {
      const { service } = setup();
      await service.saveDraft(
        DOCTOR_USER,
        'appt-1',
        draftBody({ medicines: [medicine(), medicine({ name: 'ORS' })] }),
      );
      const edited = await service.saveDraft(
        DOCTOR_USER,
        'appt-1',
        draftBody({ medicines: [medicine()] }),
      );
      expect(edited.medicines.map((m) => m.name)).toEqual(['Paracetamol']);
    });

    it('never shows a draft to the patient', async () => {
      const { service } = setup();
      const draft = await service.saveDraft(DOCTOR_USER, 'appt-1', draftBody());
      expect((await list(service)).data).toEqual([]);
      await expect(service.getMine(PATIENT, draft.id)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('discards a draft without ever exposing it, and keeps an audit event', async () => {
      const { service, db, events } = setup();
      const draft = await service.saveDraft(DOCTOR_USER, 'appt-1', draftBody());
      await service.discardDraft(DOCTOR_USER, draft.id);
      expect(db.rows(ClinicalPrescription)[0].deletedAt).toBeTruthy();
      expect(events()).toEqual(['draft_created', 'draft_discarded']);
      expect((await service.getStateForAppointment(DOCTOR_USER, 'appt-1')).draft).toBeNull();
    });

    it('only matches medicines for the authenticated patient after the prescription is issued', async () => {
      const ctx = setup();
      const draft = await ctx.service.saveDraft(DOCTOR_USER, 'appt-1', draftBody());
      await expect(ctx.service.medicineOrderOptions(PATIENT, draft.id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(ctx.service.medicineOrderOptions(OTHER_PATIENT, draft.id)).rejects.toBeInstanceOf(NotFoundException);
      await ctx.service.issue(DOCTOR_USER, draft.id, { revision: draft.revision });
      const result = await ctx.service.medicineOrderOptions(PATIENT, draft.id);
      expect(result.status).toBe(ClinicalPrescriptionStatus.ISSUED);
      expect((ctx.service as any).medicineService.matchPrescription).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ name: 'Paracetamol' })]));
    });

    it('resolves catalog medicines on the server and ignores a client-supplied name for them', async () => {
      const { service, db } = setup();
      const catalogId = '11111111-1111-4111-8111-111111111111';
      db.rows(Variant).push({
        id: catalogId,
        medicine: { name: 'Crocin', isActive: true, generic: { name: 'Paracetamol' } },
      });
      const draft = await service.saveDraft(
        DOCTOR_USER,
        'appt-1',
        draftBody({
          medicines: [medicine({ catalogMedicineId: catalogId, name: 'Something else' })],
        }),
      );
      expect(draft.medicines[0]).toMatchObject({
        source: 'catalog',
        name: 'Crocin',
        genericName: 'Paracetamol',
        catalogMedicineId: catalogId,
      });
    });

    it('stores a medicine typed by hand as manual and rejects an unknown catalog id', async () => {
      const { service } = setup();
      const manual = await service.saveDraft(DOCTOR_USER, 'appt-1', draftBody());
      expect(manual.medicines[0]).toMatchObject({
        source: 'manual',
        catalogMedicineId: null,
        genericName: null,
      });
      await expect(
        service.saveDraft(
          DOCTOR_USER,
          'appt-1',
          draftBody({
            medicines: [medicine({ catalogMedicineId: '22222222-2222-4222-8222-222222222222' })],
          }),
        ),
      ).rejects.toMatchObject({ response: { code: 'UNKNOWN_CATALOG_MEDICINE' } });
    });
  });

  describe('authorization and eligibility', () => {
    it("does not allow a doctor to prescribe for another doctor's appointment", async () => {
      const { service, db } = setup();
      await expect(
        service.saveDraft(OTHER_DOCTOR_USER, 'appt-1', draftBody()),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.getStateForAppointment(OTHER_DOCTOR_USER, 'appt-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(db.rows(ClinicalPrescription)).toHaveLength(0);
    });

    it('answers 404 for a prescription id that belongs to another doctor, on every doctor action', async () => {
      const ctx = setup();
      const rx = await issued(ctx);
      const { service } = ctx;
      await expect(service.getForDoctor(OTHER_DOCTOR_USER, rx.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.issue(OTHER_DOCTOR_USER, rx.id, { revision: 1 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        service.amend(OTHER_DOCTOR_USER, rx.id, { reason: 'wrong dose' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.cancel(OTHER_DOCTOR_USER, rx.id, { reason: 'wrong patient' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.historyForDoctor(OTHER_DOCTOR_USER, rx.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects a user without a doctor profile', async () => {
      const { service } = setup();
      await expect(service.saveDraft('someone-else', 'appt-1', draftBody())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('refuses to prescribe before the consultation has genuinely ended', async () => {
      for (const status of [
        AppointmentStatus.CONFIRMED,
        AppointmentStatus.PENDING,
        AppointmentStatus.CANCELLED,
      ]) {
        const { service, db } = setup({ appointment: { status } });
        await expect(service.saveDraft(DOCTOR_USER, 'appt-1', draftBody())).rejects.toMatchObject({
          response: { code: 'CONSULTATION_NOT_COMPLETED' },
        });
        expect(db.rows(ClinicalPrescription)).toHaveLength(0);
        const state = await service.getStateForAppointment(DOCTOR_USER, 'appt-1');
        expect(state.eligibility.canPrescribe).toBe(false);
      }
    });

    it('does not let an unverified, non-demo doctor prescribe', async () => {
      const { service } = setup({
        doctor: { isVerified: false, verificationStatus: 'unverified' },
      });
      await expect(service.saveDraft(DOCTOR_USER, 'appt-1', draftBody())).rejects.toMatchObject({
        response: { code: 'DOCTOR_NOT_VERIFIED' },
      });
    });

    it('keeps demo doctors limited to the local video-test patient rules', async () => {
      const { service } = setup({
        doctor: {
          isDemo: true,
          isVerified: false,
          verificationStatus: 'unverified',
          licenseNumber: 'DEMO-LOGIN-SYNTHETIC',
        },
      });
      // No DEMO_VIDEO_TEST_PATIENT_USER_ID configured here, so the allowlist is empty.
      await expect(service.saveDraft(DOCTOR_USER, 'appt-1', draftBody())).rejects.toMatchObject({
        response: { code: 'DEMO_NOT_PERMITTED' },
      });
    });

    it('lets the authorized demo patient flow through, and never prints a registration number for a demo doctor', async () => {
      const previous = { ...process.env };
      Object.assign(process.env, {
        NODE_ENV: 'development',
        DEMO_DOCTOR_LOGIN_ENABLED: 'true',
        DEMO_DOCTOR_OTP: '123456',
        DEMO_VIDEO_TEST_PATIENT_USER_ID: '33333333-3333-4333-8333-333333333333',
        DB_HOST: 'localhost',
        DB_SSL: 'false',
      });
      for (const marker of HOSTING_MARKERS) {
        delete process.env[marker];
      }
      try {
        const ctx = setup({
          appointment: { patientId: '33333333-3333-4333-8333-333333333333' },
          doctor: {
            isDemo: true,
            isVerified: false,
            verificationStatus: 'unverified',
            licenseNumber: 'DEMO-LOGIN-SYNTHETIC',
            registrationNumber: 'MADE-UP-1',
          },
        });
        const draft = await ctx.service.saveDraft(DOCTOR_USER, 'appt-1', draftBody());
        const result = await ctx.service.issue(DOCTOR_USER, draft.id, { revision: draft.revision });
        expect(result.prescription.doctor).toMatchObject({
          isDemo: true,
          registrationNumber: null,
          registrationVerified: false,
        });
      } finally {
        process.env = previous;
      }
    });
  });

  describe('issuing', () => {
    it('sends a nonsensitive push only to tokens registered to the patient after issuance commits', async () => {
      const ctx = setup();
      await ctx.service.registerPushToken(PATIENT, { token: 'ExponentPushToken[patient-device]', deviceId: 'device-a' });
      const send = jest.spyOn(axios, 'post').mockResolvedValueOnce({ data: { data: { status: 'ok', id: 'ticket' } } } as never);
      try {
        const draft = await ctx.service.saveDraft(DOCTOR_USER, 'appt-1', draftBody());
        await ctx.service.issue(DOCTOR_USER, draft.id, { revision: draft.revision });
        const [url, message] = send.mock.calls[0] as unknown as [string, Row];
        expect(url).toContain('/push/send');
        expect(message).toMatchObject({ to: 'ExponentPushToken[patient-device]', title: 'Prescription available' });
        expect(message.body).not.toMatch(/Paracetamol|fever|diagnosis/i);
        expect(message.data.type).toBe('prescription_issued');
        await ctx.service.issue(DOCTOR_USER, draft.id, { revision: draft.revision });
        expect(send).toHaveBeenCalledTimes(1);
      } finally { send.mockRestore(); }
    });

    it('removes a token Expo confirms is no longer registered', async () => {
      const ctx = setup();
      await ctx.service.registerPushToken(PATIENT, { token: 'ExponentPushToken[expired-device]', deviceId: 'device-a' });
      const send = jest.spyOn(axios, 'post').mockResolvedValueOnce({ data: { data: { status: 'error', details: { error: 'DeviceNotRegistered' } } } } as never);
      try {
        const draft = await ctx.service.saveDraft(DOCTOR_USER, 'appt-1', draftBody());
        await ctx.service.issue(DOCTOR_USER, draft.id, { revision: draft.revision });
        expect(ctx.db.rows(DevicePushToken)).toHaveLength(0);
      } finally { send.mockRestore(); }
    });

    it('removes an expired token when its delayed Expo receipt reports DeviceNotRegistered', async () => {
      const ctx = setup();
      await ctx.service.registerPushToken(PATIENT, { token: 'ExponentPushToken[expired-device]', deviceId: 'device-a' });
      ctx.db.rows(PushDeliveryTicket).push({ id: 'delivery-1', devicePushTokenId: ctx.db.rows(DevicePushToken)[0].id, ticketId: 'ticket-1', createdAt: new Date(Date.now() - 16 * 60 * 1000) });
      const send = jest.spyOn(axios, 'post').mockResolvedValueOnce({ data: { data: { 'ticket-1': { status: 'error', details: { error: 'DeviceNotRegistered' } } } } } as never);
      try {
        await (ctx.service as any).checkPushReceipts();
        expect(send).toHaveBeenCalledWith(expect.stringContaining('/push/getReceipts'), { ids: ['ticket-1'] }, expect.any(Object));
        expect(ctx.db.rows(DevicePushToken)).toHaveLength(0);
        expect(ctx.db.rows(PushDeliveryTicket)).toHaveLength(0);
      } finally { send.mockRestore(); }
    });

    it('retries only a provider-confirmed rate limit and reuses the same collapse key', async () => {
      const ctx = setup();
      await ctx.service.registerPushToken(PATIENT, { token: 'ExponentPushToken[patient-device]', deviceId: 'device-a' });
      const send = jest.spyOn(axios, 'post')
        .mockRejectedValueOnce({ isAxiosError: true, response: { status: 429 } } as never)
        .mockResolvedValueOnce({ data: { data: { status: 'ok', id: 'ticket' } } } as never);
      try {
        const draft = await ctx.service.saveDraft(DOCTOR_USER, 'appt-1', draftBody());
        await ctx.service.issue(DOCTOR_USER, draft.id, { revision: draft.revision });
        expect(send).toHaveBeenCalledTimes(2);
        expect(send.mock.calls[0][1]).toMatchObject({ collapseId: `prescription-${draft.id}` });
        expect(send.mock.calls[1][1]).toMatchObject({ collapseId: `prescription-${draft.id}` });
      } finally { send.mockRestore(); }
    });
    it('issues with the authenticated doctor, a timestamp, a content hash and a verified identity snapshot', async () => {
      const ctx = setup();
      const draft = await ctx.service.saveDraft(DOCTOR_USER, 'appt-1', draftBody());
      const { prescription, alreadyIssued } = await ctx.service.issue(DOCTOR_USER, draft.id, {
        revision: 1,
      });
      expect(alreadyIssued).toBe(false);
      expect(prescription).toMatchObject({ status: 'issued', digitallySigned: false });
      expect(prescription.issuedAt).toBeTruthy();
      const stored = ctx.db.rows(ClinicalPrescription)[0];
      expect(stored.issuedBy).toBe(DOCTOR_USER);
      expect(stored.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(stored.doctorSnapshot).toMatchObject({
        name: 'Dr. Asha Rao',
        registrationNumber: 'REG-12345',
        registrationCouncil: 'State Medical Council',
        registrationVerified: true,
      });
      expect(ctx.events()).toEqual(['draft_created', 'issued']);
    });

    it('does not print registration details for a doctor that is not verified', async () => {
      const ctx = setup({
        doctor: {
          isStagingFixture: true,
          isVerified: false,
          verificationStatus: 'unverified',
          registrationNumber: 'UNVERIFIED-1',
        },
      });
      const previous = { ...process.env };
      Object.assign(process.env, { NODE_ENV: 'development', STAGING_FIXTURES_ENABLED: 'true' });
      try {
        const draft = await ctx.service.saveDraft(DOCTOR_USER, 'appt-1', draftBody());
        const { prescription } = await ctx.service.issue(DOCTOR_USER, draft.id, { revision: 1 });
        expect(prescription.doctor.registrationNumber).toBeNull();
        expect(prescription.doctor.registrationVerified).toBe(false);
      } finally {
        process.env = previous;
      }
    });

    it('creates a generic patient notification after the issue commit, with the patient as recipient', async () => {
      const ctx = setup();
      const rx = await issued(ctx);
      const notes = ctx.db.rows(Notification);
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({
        userId: PATIENT,
        type: 'prescription_issued',
        title: 'New prescription available',
        body: 'Your doctor has issued a prescription. Tap to view it.',
        data: { prescriptionId: rx.id },
        isRead: false,
      });
      expect(notes[0].body).not.toMatch(/Paracetamol|Viral fever|dosage|diagnosis/i);
      expect(ctx.db.rows(NotificationOutbox)).toHaveLength(1);
      expect(ctx.db.rows(NotificationOutbox)[0].deliveredAt).toBeInstanceOf(Date);
    });

    it('keeps a committed prescription and retries notification delivery after a notification insert failure', async () => {
      const ctx = setup();
      const originalSave = ctx.db.save;
      let failOnce = true;
      ctx.db.save = async (entity: unknown, value: Row) => {
        if (entity === Notification && failOnce) {
          failOnce = false;
          throw new Error('database write failed');
        }
        return originalSave(entity, value);
      };

      const draft = await ctx.service.saveDraft(DOCTOR_USER, 'appt-1', draftBody());
      const result = await ctx.service.issue(DOCTOR_USER, draft.id, { revision: draft.revision });
      expect(result.prescription.status).toBe('issued');
      expect(ctx.db.rows(ClinicalPrescription)[0].status).toBe('issued');
      expect(ctx.db.rows(Notification)).toHaveLength(0);
      expect(ctx.db.rows(NotificationOutbox)).toHaveLength(1);
      expect(ctx.db.rows(NotificationOutbox)[0].deliveredAt).toBeNull();

      ctx.db.save = originalSave;
      await ctx.service.retryPendingNotificationOutbox();
      expect(ctx.db.rows(Notification)).toHaveLength(1);
      expect(ctx.db.rows(NotificationOutbox)).toHaveLength(1);
      expect(ctx.db.rows(NotificationOutbox)[0].deliveredAt).toBeInstanceOf(Date);
    });

    it('rejects an incomplete prescription with field details', async () => {
      const ctx = setup();
      const draft = await ctx.service.saveDraft(
        DOCTOR_USER,
        'appt-1',
        draftBody({ diagnosis: '', medicines: [] }),
      );
      await expect(
        ctx.service.issue(DOCTOR_USER, draft.id, { revision: draft.revision }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        ctx.service.issue(DOCTOR_USER, draft.id, { revision: draft.revision }),
      ).rejects.toMatchObject({
        response: {
          code: 'PRESCRIPTION_INCOMPLETE',
          details: { diagnosis: expect.any(Array), medicines: expect.any(Array) },
        },
      });
      expect(ctx.db.rows(Notification)).toHaveLength(0);
      expect(ctx.db.rows(NotificationOutbox)).toHaveLength(0);
    });

    it('rejects a follow-up date before the consultation', async () => {
      const ctx = setup();
      const draft = await ctx.service.saveDraft(
        DOCTOR_USER,
        'appt-1',
        draftBody({ followUpDate: '2026-10-01' }),
      );
      await expect(
        ctx.service.issue(DOCTOR_USER, draft.id, { revision: draft.revision }),
      ).rejects.toMatchObject({
        response: { details: { followUpDate: expect.any(Array) } },
      });
    });

    it('refuses to issue content the doctor did not review (stale revision)', async () => {
      const ctx = setup();
      const draft = await ctx.service.saveDraft(DOCTOR_USER, 'appt-1', draftBody());
      await ctx.service.saveDraft(DOCTOR_USER, 'appt-1', draftBody({ diagnosis: 'Changed' }));
      await expect(
        ctx.service.issue(DOCTOR_USER, draft.id, { revision: draft.revision }),
      ).rejects.toMatchObject({
        response: { code: 'REVISION_CHANGED' },
      });
    });

    it('is safe to retry: a repeated issue returns the same prescription without a second record, event or notification', async () => {
      const ctx = setup();
      const draft = await ctx.service.saveDraft(DOCTOR_USER, 'appt-1', draftBody());
      const first = await ctx.service.issue(DOCTOR_USER, draft.id, { revision: 1 });
      const retry = await ctx.service.issue(DOCTOR_USER, draft.id, { revision: 1 });
      expect(retry.alreadyIssued).toBe(true);
      expect(retry.prescription.issuedAt).toBe(first.prescription.issuedAt);
      expect(ctx.db.rows(ClinicalPrescription)).toHaveLength(1);
      expect(ctx.events().filter((e) => e === 'issued')).toHaveLength(1);
      expect(ctx.db.rows(Notification)).toHaveLength(1);
      expect(ctx.db.rows(NotificationOutbox)).toHaveLength(1);
    });

    it('issues once when two requests race (double tap)', async () => {
      const ctx = setup();
      const draft = await ctx.service.saveDraft(DOCTOR_USER, 'appt-1', draftBody());
      const [a, b] = await Promise.all([
        ctx.service.issue(DOCTOR_USER, draft.id, { revision: 1 }),
        ctx.service.issue(DOCTOR_USER, draft.id, { revision: 1 }),
      ]);
      expect([a.alreadyIssued, b.alreadyIssued].sort()).toEqual([false, true]);
      expect(ctx.events().filter((e) => e === 'issued')).toHaveLength(1);
      expect(ctx.db.rows(Notification)).toHaveLength(1);
      expect(ctx.db.rows(NotificationOutbox)).toHaveLength(1);
    });

    it('does not allow the issued content to be edited through the draft endpoint', async () => {
      const ctx = setup();
      await issued(ctx);
      await expect(
        ctx.service.saveDraft(DOCTOR_USER, 'appt-1', draftBody({ diagnosis: 'Sneaky edit' })),
      ).rejects.toMatchObject({ response: { code: 'AMENDMENT_REQUIRED' } });
      expect(ctx.db.rows(ClinicalPrescription)[0].diagnosis).toBe('Viral fever');
    });

    it('refuses to re-issue under a different revision once issued', async () => {
      const ctx = setup();
      const rx = await issued(ctx);
      await expect(ctx.service.issue(DOCTOR_USER, rx.id, { revision: 99 })).rejects.toMatchObject({
        response: { code: 'NOT_A_DRAFT' },
      });
    });
  });

  describe('patient access', () => {
    it('shows the patient their issued prescription with every dosing field', async () => {
      const ctx = setup();
      const rx = await issued(ctx);
      const page = await list(ctx.service);
      expect(page.data).toHaveLength(1);
      const detail = await ctx.service.getMine(PATIENT, rx.id);
      expect(detail).toMatchObject({
        status: 'issued',
        diagnosis: 'Viral fever',
        followUpDate: FOLLOW_UP,
        consultation: { date: '2026-10-20' },
        doctor: { name: 'Dr. Asha Rao', specialization: 'Cardiology' },
        patient: { name: 'Pia Patient', gender: 'female' },
      });
      expect(detail.medicines[0]).toMatchObject({
        name: 'Paracetamol',
        strength: '500 mg',
        dose: '1 tablet',
        route: 'oral',
        frequency: 'Three times daily',
        durationValue: 5,
        durationUnit: 'days',
        quantity: 15,
        foodRelation: 'after_food',
      });
    });

    it('hides prescriptions of other patients (list and detail)', async () => {
      const ctx = setup();
      const rx = await issued(ctx);
      expect((await list(ctx.service, OTHER_PATIENT)).data).toEqual([]);
      await expect(ctx.service.getMine(OTHER_PATIENT, rx.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("does not leak the content hash, audit data or the doctor's user id to the patient", async () => {
      const ctx = setup();
      const rx = await issued(ctx);
      const json = JSON.stringify(await ctx.service.getMine(PATIENT, rx.id));
      expect(json).not.toContain('contentHash');
      expect(json).not.toContain(DOCTOR_USER);
      expect(json).not.toContain('revision');
    });
  });

  describe('amendments and audit history', () => {
    it('keeps the original valid until the amendment is issued, then supersedes it with a linked record', async () => {
      const ctx = setup();
      const original = await issued(ctx);

      const amendment = await ctx.service.amend(DOCTOR_USER, original.id, {
        reason: 'Dose was wrong',
      });
      expect(amendment).toMatchObject({
        status: 'draft',
        version: 2,
        supersedesId: original.id,
        amendmentReason: 'Dose was wrong',
      });
      // While the correction is a draft the patient still sees the original, unchanged, and not the draft.
      let patientView = (await list(ctx.service)).data;
      expect(patientView.map((p) => p.status)).toEqual(['issued']);

      await ctx.service.saveDraft(
        DOCTOR_USER,
        'appt-1',
        draftBody({ medicines: [medicine({ dose: '2 tablets' })] }),
      );
      const edited = (await ctx.service.getStateForAppointment(DOCTOR_USER, 'appt-1')).draft!;
      await ctx.service.issue(DOCTOR_USER, edited.id, { revision: edited.revision });

      patientView = (await list(ctx.service)).data;
      expect(patientView.map((p) => p.status).sort()).toEqual(['issued', 'superseded']);
      const old = await ctx.service.getMine(PATIENT, original.id);
      expect(old.status).toBe('superseded');
      expect(old.supersededById).toBe(edited.id);
      expect(old.medicines[0].dose).toBe('1 tablet'); // the superseded record is preserved, never rewritten
      expect((await ctx.service.getMine(PATIENT, edited.id)).medicines[0].dose).toBe('2 tablets');
      expect(ctx.db.rows(Notification)).toHaveLength(2);
      expect(ctx.db.rows(Notification)[1].title).toBe('New prescription available');
    });

    it('returns the same amendment draft when the request is repeated, and blocks a second unrelated draft', async () => {
      const ctx = setup();
      const original = await issued(ctx);
      const a = await ctx.service.amend(DOCTOR_USER, original.id, { reason: 'Dose was wrong' });
      const b = await ctx.service.amend(DOCTOR_USER, original.id, { reason: 'Dose was wrong' });
      expect(b.id).toBe(a.id);
      expect(ctx.db.rows(ClinicalPrescription)).toHaveLength(2);
    });

    it('cancels an issued prescription, keeps the record and tells the patient', async () => {
      const ctx = setup();
      const rx = await issued(ctx);
      const cancelled = await ctx.service.cancel(DOCTOR_USER, rx.id, {
        reason: 'Written for wrong patient',
      });
      expect(cancelled.status).toBe('cancelled');
      const patientDetail = await ctx.service.getMine(PATIENT, rx.id);
      expect(patientDetail).toMatchObject({
        status: 'cancelled',
        cancellationReason: 'Written for wrong patient',
      });
      expect(ctx.db.rows(Notification).at(-1)!.title).toMatch(/cancelled/i);
      await expect(
        ctx.service.cancel(DOCTOR_USER, rx.id, { reason: 'Again please' }),
      ).rejects.toMatchObject({
        response: { code: 'NOT_ISSUED' },
      });
    });

    it('records who did what, in order, across the whole amendment chain', async () => {
      const ctx = setup();
      const original = await issued(ctx);
      await ctx.service.amend(DOCTOR_USER, original.id, { reason: 'Dose was wrong' });
      const draft = (await ctx.service.getStateForAppointment(DOCTOR_USER, 'appt-1')).draft!;
      await ctx.service.issue(DOCTOR_USER, draft.id, { revision: draft.revision });
      expect(ctx.events()).toEqual([
        'draft_created',
        'issued',
        'amendment_started',
        'superseded',
        'amendment_issued',
      ]);
      expect(new Set(ctx.db.rows(ClinicalPrescriptionEvent).map((e) => e.actorUserId))).toEqual(
        new Set([DOCTOR_USER]),
      );
      const history = await ctx.service.historyForDoctor(DOCTOR_USER, draft.id);
      expect(history.map((h) => h.action)).toContain('amendment_issued');
    });
  });

  describe('input validation', () => {
    it('rejects identity or status fields supplied by the client', () => {
      for (const extra of [
        { patientId: 'x' },
        { doctorId: 'x' },
        { status: 'issued' },
        { issuedBy: 'x' },
      ]) {
        expect(() => SaveDraftSchema.parse({ ...draftBody(), ...extra })).toThrow();
      }
    });

    it('requires dose, route, frequency, duration, quantity and strength for each medicine', () => {
      for (const field of [
        'strength',
        'dose',
        'route',
        'frequency',
        'durationValue',
        'quantity',
        'dosageForm',
        'name',
      ]) {
        const bad = { ...medicine() } as Row;
        delete bad[field];
        expect(() => SaveDraftSchema.parse({ medicines: [bad] })).toThrow();
      }
      expect(() =>
        SaveDraftSchema.parse({ medicines: [medicine({ durationValue: 0 })] }),
      ).toThrow();
      expect(() => SaveDraftSchema.parse({ medicines: [medicine({ quantity: -1 })] })).toThrow();
      expect(() => SaveDraftSchema.parse({ medicines: [medicine({ route: 'smoke' })] })).toThrow();
      expect(() =>
        SaveDraftSchema.parse({ medicines: Array.from({ length: 21 }, () => medicine()) }),
      ).toThrow();
    });

    it('rejects an impossible follow-up date', () => {
      expect(() => SaveDraftSchema.parse({ followUpDate: '2026-02-31' })).toThrow();
      expect(() => SaveDraftSchema.parse({ followUpDate: 'tomorrow' })).toThrow();
    });
  });

  describe('route protection metadata', () => {
    it('restricts doctor routes to doctors and patient routes to patients', () => {
      expect(Reflect.getMetadata(ROLES_KEY, DoctorPrescriptionController)).toEqual([
        UserRole.DOCTOR,
      ]);
      expect(Reflect.getMetadata(ROLES_KEY, PatientPrescriptionController)).toEqual([
        UserRole.PATIENT,
      ]);
    });
  });
});
