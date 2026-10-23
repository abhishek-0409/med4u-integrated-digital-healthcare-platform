import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, LessThan, Not, Repository } from 'typeorm';
import axios from 'axios';
import { PaginatedResponse } from '../../common/utils/pagination.util';
import { Appointment, AppointmentStatus } from '../../database/entities/appointment.entity';
import {
  ClinicalPrescription,
  ClinicalPrescriptionStatus,
  PrescribedMedicine,
  PrescribedTest,
} from '../../database/entities/clinical-prescription.entity';
import {
  ClinicalPrescriptionAction,
  ClinicalPrescriptionEvent,
} from '../../database/entities/clinical-prescription-event.entity';
import { Doctor } from '../../database/entities/doctor.entity';
import { Notification, NotificationType } from '../../database/entities/notification.entity';
import { NotificationOutbox } from '../../database/entities/notification-outbox.entity';
import { Variant } from '../../database/entities/variant.entity';
import { LabTest } from '../../database/entities/lab-test.entity';
import { DevicePushToken } from '../../database/entities/device-push-token.entity';
import { PushDeliveryTicket } from '../../database/entities/push-delivery-ticket.entity';
import { isDemoVideoTestParticipant } from '../auth/demo-doctor';
import { MedicineService } from '../medicines/medicine.service';
import { addDays, todayInClinic } from '../appointments/appointment-time.util';
import { stagingFixturesEnabled } from '../doctors/doctor-eligibility';
import {
  AmendPrescriptionDto,
  CancelPrescriptionDto,
  IssuePrescriptionDto,
  ListMyClinicalPrescriptionsQueryDto,
  PrescribedMedicineInput,
  PrescribedTestInput,
  SaveDraftDto,
  RegisterPushTokenDto,
  SearchPrescriptionLabTestsDto,
} from './dto/clinical-prescription.dto';
import {
  AppointmentPrescriptionState,
  DoctorPrescriptionView,
  IssueResult,
  PatientPrescriptionView,
  PrescriptionEligibility,
  PrescriptionHistoryEntry,
} from './clinical-prescription.types';
import {
  ageOn,
  ClinicalContent,
  contentOf,
  hashPrescription,
  isUniqueViolation,
  prescriptionReference,
  sameContent,
  snapshotDoctor,
} from './clinical-prescription.util';

type Actor = string;

const VISIBLE_TO_PATIENT = [
  ClinicalPrescriptionStatus.ISSUED,
  ClinicalPrescriptionStatus.SUPERSEDED,
  ClinicalPrescriptionStatus.CANCELLED,
];

@Injectable()
export class ClinicalPrescriptionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ClinicalPrescriptionService.name);
  private receiptTimer?: NodeJS.Timeout;
  private notificationOutboxTimer?: NodeJS.Timeout;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ClinicalPrescription)
    private readonly rxRepo: Repository<ClinicalPrescription>,
    @InjectRepository(ClinicalPrescriptionEvent)
    private readonly events: Repository<ClinicalPrescriptionEvent>,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
    @InjectRepository(Doctor) private readonly doctors: Repository<Doctor>,
    @InjectRepository(Variant) private readonly variants: Repository<Variant>,
    @InjectRepository(DevicePushToken) private readonly pushTokens: Repository<DevicePushToken>,
    @InjectRepository(PushDeliveryTicket) private readonly pushTickets: Repository<PushDeliveryTicket>,
    private readonly medicineService: MedicineService,
  ) {}

  onModuleInit(): void {
    void this.checkPushReceipts();
    void this.retryPendingNotificationOutbox();
    this.receiptTimer = setInterval(() => void this.checkPushReceipts(), 15 * 60 * 1000);
    this.notificationOutboxTimer = setInterval(() => void this.retryPendingNotificationOutbox(), 30 * 1000);
    this.receiptTimer.unref?.();
    this.notificationOutboxTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.receiptTimer) clearInterval(this.receiptTimer);
    if (this.notificationOutboxTimer) clearInterval(this.notificationOutboxTimer);
  }

  // ── Doctor: read ──────────────────────────────────────────────────────────

  /** Eligibility plus the open draft and the currently valid issued prescription for one appointment. */
  async getStateForAppointment(
    doctorUserId: Actor,
    appointmentId: string,
  ): Promise<AppointmentPrescriptionState> {
    const { appointment, doctor } = await this.loadOwnedAppointment(doctorUserId, appointmentId);
    const [draft, issued] = await Promise.all([
      this.rxRepo.findOne({
        where: { appointmentId, status: ClinicalPrescriptionStatus.DRAFT },
        order: { createdAt: 'DESC' },
      }),
      this.rxRepo.findOne({ where: { appointmentId, status: ClinicalPrescriptionStatus.ISSUED } }),
    ]);
    return {
      eligibility: this.assess(appointment, doctor),
      draft: draft ? this.toDoctorView(draft, appointment, doctor) : null,
      issued: issued ? this.toDoctorView(issued, appointment, doctor) : null,
    };
  }

  async getForDoctor(doctorUserId: Actor, id: string): Promise<DoctorPrescriptionView> {
    const doctor = await this.requireDoctor(doctorUserId);
    const rx = await this.rxRepo.findOne({ where: { id, doctorId: doctor.id } });
    if (!rx) throw this.notFound();
    const appointment = await this.loadAppointment(rx.appointmentId);
    return this.toDoctorView(rx, appointment, doctor);
  }

  async historyForDoctor(doctorUserId: Actor, id: string): Promise<PrescriptionHistoryEntry[]> {
    const doctor = await this.requireDoctor(doctorUserId);
    const rx = await this.rxRepo.findOne({ where: { id, doctorId: doctor.id }, withDeleted: true });
    if (!rx) throw this.notFound();
    // The audit trail of the whole appointment chain, so an amendment shows what it replaced.
    const chain = await this.rxRepo.find({
      where: { appointmentId: rx.appointmentId, doctorId: doctor.id },
      withDeleted: true,
      select: { id: true },
    });
    const rows = await this.events.find({
      where: { prescriptionId: In(chain.map((r) => r.id)) },
      order: { createdAt: 'ASC' },
    });
    return rows.map((e) => ({
      action: e.action,
      at: e.createdAt.toISOString(),
      fromStatus: e.fromStatus ?? null,
      toStatus: e.toStatus ?? null,
      metadata: e.metadata ?? null,
    }));
  }

  // ── Doctor: draft ─────────────────────────────────────────────────────────

  /**
   * Creates the appointment's draft or updates it in place. Idempotent: resending identical content changes
   * nothing, so network retries never create duplicates or extra revisions.
   */
  async saveDraft(
    doctorUserId: Actor,
    appointmentId: string,
    dto: SaveDraftDto,
  ): Promise<DoctorPrescriptionView> {
    const { appointment, doctor } = await this.loadOwnedAppointment(doctorUserId, appointmentId);
    this.requireEligible(this.assess(appointment, doctor));
    const content = await this.buildContent(dto);

    try {
      const saved = await this.dataSource.transaction(async (manager) => {
        const existingIssued = await manager.findOne(ClinicalPrescription, {
          where: { appointmentId, status: ClinicalPrescriptionStatus.ISSUED },
        });
        const draft = await manager.findOne(ClinicalPrescription, {
          where: { appointmentId, status: ClinicalPrescriptionStatus.DRAFT },
          lock: { mode: 'pessimistic_write' },
        });

        if (draft) {
          if (draft.doctorId !== doctor.id) throw this.notFound();
          if (sameContent(contentOf(draft), content)) return draft;
          if (dto.baseRevision != null && dto.baseRevision !== draft.revision) {
            throw new ConflictException({
              code: 'DRAFT_REVISION_CHANGED',
              message: 'The draft changed on the server. Reload it before saving more edits.',
              revision: draft.revision,
            });
          }
          Object.assign(draft, this.contentColumns(content), { revision: draft.revision + 1 });
          const updated = await manager.save(ClinicalPrescription, draft);
          await this.recordEvent(manager, updated, doctorUserId, 'draft_updated', {
            from: ClinicalPrescriptionStatus.DRAFT,
            to: ClinicalPrescriptionStatus.DRAFT,
            metadata: { revision: updated.revision },
          });
          return updated;
        }

        if (existingIssued) {
          throw new ConflictException({
            code: 'AMENDMENT_REQUIRED',
            message:
              'A prescription has already been issued for this consultation. Start an amendment to correct it.',
          });
        }

        const latest = await manager.findOne(ClinicalPrescription, {
          where: { appointmentId },
          order: { version: 'DESC' },
          withDeleted: true,
        });
        const created = await manager.save(
          ClinicalPrescription,
          manager.create(ClinicalPrescription, {
            appointmentId,
            doctorId: doctor.id,
            patientId: appointment.patientId,
            status: ClinicalPrescriptionStatus.DRAFT,
            version: (latest?.version ?? 0) + 1,
            revision: 1,
            ...this.contentColumns(content),
          }),
        );
        await this.recordEvent(manager, created, doctorUserId, 'draft_created', {
          to: ClinicalPrescriptionStatus.DRAFT,
          metadata: { revision: created.revision },
        });
        return created;
      });
      return this.toDoctorView(saved, appointment, doctor);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'DRAFT_CONFLICT',
          message: 'Another save for this prescription is in progress. Try again.',
        });
      }
      throw error;
    }
  }

  async discardDraft(doctorUserId: Actor, id: string): Promise<void> {
    const doctor = await this.requireDoctor(doctorUserId);
    await this.dataSource.transaction(async (manager) => {
      const rx = await this.lockOwned(manager, id, doctor);
      if (rx.status !== ClinicalPrescriptionStatus.DRAFT) {
        throw new ConflictException({
          code: 'NOT_A_DRAFT',
          message:
            'Only a draft can be discarded. Issued prescriptions are cancelled or amended instead.',
        });
      }
      await this.recordEvent(manager, rx, doctorUserId, 'draft_discarded', {
        from: ClinicalPrescriptionStatus.DRAFT,
        metadata: { revision: rx.revision },
      });
      await manager.softRemove(ClinicalPrescription, rx);
    });
  }

  // ── Doctor: issue ─────────────────────────────────────────────────────────

  /**
   * Issues a draft. Safe to repeat: a retry for a prescription that is already issued (same revision, same doctor)
   * returns it unchanged with `alreadyIssued: true` and creates no second record, event or notification.
   * Concurrent calls are serialised by a row lock.
   */
  async issue(doctorUserId: Actor, id: string, dto: IssuePrescriptionDto): Promise<IssueResult> {
    const doctor = await this.requireDoctor(doctorUserId);

    let alreadyIssued = false;
    let issuedRx: ClinicalPrescription;
    let notificationOutboxId: string | null = null;
    try {
      issuedRx = await this.dataSource.transaction(async (manager) => {
        const rx = await this.lockOwned(manager, id, doctor);

        if (rx.status !== ClinicalPrescriptionStatus.DRAFT) {
          if (
            rx.status === ClinicalPrescriptionStatus.ISSUED &&
            rx.issuedBy === doctorUserId &&
            rx.revision === dto.revision
          ) {
            alreadyIssued = true;
            return rx;
          }
          throw new ConflictException({
            code: 'NOT_A_DRAFT',
            message:
              'This prescription has already been issued or closed and cannot be issued again.',
          });
        }
        if (rx.revision !== dto.revision) {
          throw new ConflictException({
            code: 'REVISION_CHANGED',
            message:
              'The prescription changed after you reviewed it. Review the latest version and try again.',
          });
        }

        // Re-validate against current data inside the transaction, never against what the client saw earlier.
        const appointment = await manager.findOne(Appointment, {
          where: { id: rx.appointmentId },
          relations: { doctor: { user: true }, patient: true, slot: true },
        });
        if (
          !appointment ||
          appointment.doctorId !== doctor.id ||
          appointment.patientId !== rx.patientId
        ) {
          throw this.notFound();
        }
        this.requireEligible(this.assess(appointment, appointment.doctor));
        this.requireIssuable(rx, appointment);

        let original: ClinicalPrescription | null = null;
        if (rx.supersedesId) {
          original = await manager.findOne(ClinicalPrescription, {
            where: { id: rx.supersedesId },
            lock: { mode: 'pessimistic_write' },
          });
          if (
            !original ||
            original.status !== ClinicalPrescriptionStatus.ISSUED ||
            original.appointmentId !== rx.appointmentId ||
            original.doctorId !== doctor.id
          ) {
            throw new ConflictException({
              code: 'AMENDMENT_TARGET_CHANGED',
              message:
                'The prescription being amended is no longer current. Discard this amendment and start again.',
            });
          }
          // The one-issued-per-appointment index requires the old record to leave "issued" first.
          original.status = ClinicalPrescriptionStatus.SUPERSEDED;
          original.supersededById = rx.id;
          await manager.save(ClinicalPrescription, original);
          await this.recordEvent(manager, original, doctorUserId, 'superseded', {
            from: ClinicalPrescriptionStatus.ISSUED,
            to: ClinicalPrescriptionStatus.SUPERSEDED,
            metadata: { supersededBy: rx.id },
          });
        }

        const issuedAt = new Date();
        rx.status = ClinicalPrescriptionStatus.ISSUED;
        rx.issuedAt = issuedAt;
        rx.issuedBy = doctorUserId;
        rx.doctorSnapshot = snapshotDoctor(appointment.doctor);
        rx.contentHash = hashPrescription({ ...rx, ...contentOf(rx) });
        const saved = await manager.save(ClinicalPrescription, rx);

        await this.recordEvent(
          manager,
          saved,
          doctorUserId,
          original ? 'amendment_issued' : 'issued',
          {
            from: ClinicalPrescriptionStatus.DRAFT,
            to: ClinicalPrescriptionStatus.ISSUED,
            metadata: {
              revision: saved.revision,
              version: saved.version,
              contentHash: saved.contentHash,
              ...(original ? { supersedes: original.id } : {}),
            },
          },
        );
        const outbox = await this.enqueuePatientNotification(manager, saved);
        notificationOutboxId = outbox.id;
        return saved;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'ALREADY_ISSUED',
          message: 'A prescription has already been issued for this consultation.',
        });
      }
      throw error;
    }

    if (!alreadyIssued) {
      if (notificationOutboxId) await this.deliverNotificationOutbox(notificationOutboxId);
      await this.sendPrescriptionPush(issuedRx);
    }
    const appointment = await this.loadAppointment(issuedRx.appointmentId);
    return { prescription: this.toDoctorView(issuedRx, appointment, doctor), alreadyIssued };
  }

  async registerPushToken(userId: string, dto: RegisterPushTokenDto): Promise<void> {
    // A physical device token belongs to one active account at a time, including after account switching.
    await this.pushTokens.delete({ token: dto.token });
    await this.pushTokens.upsert({ userId, deviceId: dto.deviceId, token: dto.token }, ['userId', 'deviceId']);
  }

  async removePushToken(userId: string, deviceId: string): Promise<void> {
    await this.pushTokens.delete({ userId, deviceId });
  }

  /** Expo acceptance is recorded only in the provider response; the in-app row remains the guaranteed fallback. */
  private async sendPrescriptionPush(rx: ClinicalPrescription): Promise<void> {
    const tokens = await this.pushTokens.find({ where: { userId: rx.patientId } });
    for (const record of tokens) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const response = await axios.post('https://exp.host/--/api/v2/push/send', {
            to: record.token,
            title: 'Prescription available',
            body: 'A new prescription is available in Med4U.',
            data: { type: 'prescription_issued', prescriptionId: rx.id },
            sound: 'default',
            collapseId: `prescription-${rx.id}`,
          }, { timeout: 5000, headers: { Accept: 'application/json', 'Content-Type': 'application/json' } });
          const ticketData = response.data?.data;
          const ticket = Array.isArray(ticketData) ? ticketData[0] : ticketData;
          if (ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered') {
            await this.pushTokens.delete({ id: record.id, userId: rx.patientId });
          } else if (ticket?.status === 'ok' && typeof ticket.id === 'string') {
            // Expo tickets are not delivery receipts. Persist the ticket for the delayed receipt check.
            await this.pushTickets.save({
              devicePushTokenId: record.id,
              ticketId: ticket.id,
            });
          }
          break;
        } catch (error) {
          // Retry only an explicit 429 response, which confirms this attempt was rejected. A lost/ambiguous
          // response is not retried because the provider may already have accepted it.
          const status = axios.isAxiosError(error) ? error.response?.status : undefined;
          if (status === 429 && attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
            continue;
          }
          this.logger.warn('Prescription push provider request failed');
          break;
        }
      }
    }
  }

  /** Expo receipts report invalid/expired device tokens after provider processing has completed. */
  private async checkPushReceipts(): Promise<void> {
    let pending: PushDeliveryTicket[];
    try {
      pending = await this.pushTickets.find({
        where: { createdAt: LessThan(new Date(Date.now() - 15 * 60 * 1000)) },
      });
    } catch {
      this.logger.warn('Push receipt lookup failed');
      return;
    }
    for (let offset = 0; offset < pending.length; offset += 300) {
      const batch = pending.slice(offset, offset + 300);
      try {
        const response = await axios.post('https://exp.host/--/api/v2/push/getReceipts', {
          ids: batch.map((ticket) => ticket.ticketId),
        }, { timeout: 10000, headers: { Accept: 'application/json', 'Content-Type': 'application/json' } });
        const receipts = response.data?.data ?? {};
        for (const ticket of batch) {
          const receipt = receipts[ticket.ticketId];
          if (!receipt) continue;
          const token = await this.pushTokens.findOne({ where: { id: ticket.devicePushTokenId } });
          if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
            if (token) await this.pushTokens.delete({ id: token.id, userId: token.userId });
          }
          await this.pushTickets.delete({ id: ticket.id });
        }
      } catch {
        // Keep pending ticket IDs for a later receipt poll; no token or health data enters logs.
        this.logger.warn('Push receipt lookup failed');
      }
    }
  }

  // ── Doctor: amend / cancel ────────────────────────────────────────────────

  /**
   * Starts a correction. The issued prescription stays valid and visible to the patient until the amendment
   * is itself issued; only then is the original marked superseded. Repeating the call returns the same draft.
   */
  async amend(
    doctorUserId: Actor,
    id: string,
    dto: AmendPrescriptionDto,
  ): Promise<DoctorPrescriptionView> {
    const doctor = await this.requireDoctor(doctorUserId);
    try {
      const draft = await this.dataSource.transaction(async (manager) => {
        const original = await this.lockOwned(manager, id, doctor);

        const openDraft = await manager.findOne(ClinicalPrescription, {
          where: {
            appointmentId: original.appointmentId,
            status: ClinicalPrescriptionStatus.DRAFT,
          },
        });
        if (openDraft) {
          if (openDraft.supersedesId === original.id) return openDraft;
          throw new ConflictException({
            code: 'DRAFT_EXISTS',
            message: 'A draft already exists for this consultation. Finish or discard it first.',
          });
        }
        if (original.status !== ClinicalPrescriptionStatus.ISSUED) {
          throw new ConflictException({
            code: 'NOT_ISSUED',
            message: 'Only the current issued prescription can be amended.',
          });
        }
        const appointment = await manager.findOne(Appointment, {
          where: { id: original.appointmentId },
          relations: { doctor: { user: true }, patient: true, slot: true },
        });
        if (!appointment || appointment.doctorId !== doctor.id) throw this.notFound();
        this.requireEligible(this.assess(appointment, appointment.doctor));

        const created = await manager.save(
          ClinicalPrescription,
          manager.create(ClinicalPrescription, {
            appointmentId: original.appointmentId,
            doctorId: original.doctorId,
            patientId: original.patientId,
            status: ClinicalPrescriptionStatus.DRAFT,
            version: original.version + 1,
            revision: 1,
            supersedesId: original.id,
            amendmentReason: dto.reason,
            ...this.contentColumns(contentOf(original)),
          }),
        );
        await this.recordEvent(manager, created, doctorUserId, 'amendment_started', {
          to: ClinicalPrescriptionStatus.DRAFT,
          metadata: { supersedes: original.id, reason: dto.reason },
        });
        return created;
      });
      const appointment = await this.loadAppointment(draft.appointmentId);
      return this.toDoctorView(draft, appointment, doctor);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'DRAFT_EXISTS',
          message: 'A draft already exists for this consultation. Finish or discard it first.',
        });
      }
      throw error;
    }
  }

  /** Withdraws an issued prescription (for example one written for the wrong patient). The record is kept. */
  async cancel(
    doctorUserId: Actor,
    id: string,
    dto: CancelPrescriptionDto,
  ): Promise<DoctorPrescriptionView> {
    const doctor = await this.requireDoctor(doctorUserId);
    const cancelled = await this.dataSource.transaction(async (manager) => {
      const rx = await this.lockOwned(manager, id, doctor);
      if (rx.status !== ClinicalPrescriptionStatus.ISSUED) {
        throw new ConflictException({
          code: 'NOT_ISSUED',
          message: 'Only an issued prescription can be cancelled.',
        });
      }
      rx.status = ClinicalPrescriptionStatus.CANCELLED;
      rx.cancelledAt = new Date();
      rx.cancellationReason = dto.reason;
      const saved = await manager.save(ClinicalPrescription, rx);
      await this.recordEvent(manager, saved, doctorUserId, 'cancelled', {
        from: ClinicalPrescriptionStatus.ISSUED,
        to: ClinicalPrescriptionStatus.CANCELLED,
        metadata: { reason: dto.reason },
      });
      const appointment = await manager.findOne(Appointment, {
        where: { id: saved.appointmentId },
        relations: { slot: true },
      });
      await manager.save(
        Notification,
        manager.create(Notification, {
          userId: saved.patientId,
          type: NotificationType.PRESCRIPTION_READY,
          title: 'A prescription was cancelled',
          body: `Your doctor cancelled the prescription ${prescriptionReference(saved.id, saved.version)}${
            appointment ? ` from ${appointment.slot.date}` : ''
          }. Open it for details before taking any medicine from it.`,
          data: {
            prescriptionId: saved.id,
            appointmentId: saved.appointmentId,
            event: 'cancelled',
          },
        }),
      );
      return saved;
    });
    const appointment = await this.loadAppointment(cancelled.appointmentId);
    return this.toDoctorView(cancelled, appointment, doctor);
  }

  // ── Patient ───────────────────────────────────────────────────────────────

  /** The authenticated patient's prescriptions. Drafts are excluded by the query itself, not by the caller. */
  async listMine(
    patientId: string,
    query: ListMyClinicalPrescriptionsQueryDto,
  ): Promise<PaginatedResponse<PatientPrescriptionView>> {
    const [rows, total] = await this.rxRepo.findAndCount({
      where: {
        patientId,
        status: In(VISIBLE_TO_PATIENT),
        issuedAt: Not(IsNull()),
        ...(query.appointmentId ? { appointmentId: query.appointmentId } : {}),
      },
      relations: { appointment: { slot: true }, patient: true },
      order: { issuedAt: 'DESC', id: 'ASC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return new PaginatedResponse(
      rows.map((r) => this.toPatientView(r)),
      total,
      query.page,
      query.limit,
    );
  }

  async getMine(patientId: string, id: string): Promise<PatientPrescriptionView> {
    const rx = await this.rxRepo.findOne({
      where: { id, patientId, status: In(VISIBLE_TO_PATIENT), issuedAt: Not(IsNull()) },
      relations: { appointment: { slot: true }, patient: true },
    });
    if (!rx) throw this.notFound();
    return this.toPatientView(rx);
  }

  async medicineOrderOptions(patientId: string, id: string) {
    const rx = await this.rxRepo.findOne({
      where: { id, patientId, status: ClinicalPrescriptionStatus.ISSUED, issuedAt: Not(IsNull()) },
    });
    if (!rx) throw this.notFound();
    return {
      prescriptionId: rx.id,
      reference: prescriptionReference(rx.id, rx.version),
      status: rx.status,
      medicines: await this.medicineService.matchPrescription(rx.medicines ?? []),
    };
  }

  // ── Eligibility ───────────────────────────────────────────────────────────

  /** Whether this doctor may write a prescription for this appointment right now. Pure: no I/O. */
  assess(
    appointment: Pick<Appointment, 'status' | 'patientId'>,
    doctor: Pick<Doctor, 'isDemo' | 'licenseNumber' | 'isVerified' | 'isStagingFixture'>,
  ): PrescriptionEligibility {
    if (appointment.status !== AppointmentStatus.COMPLETED) {
      return {
        canPrescribe: false,
        code: 'CONSULTATION_NOT_COMPLETED',
        message: 'A prescription can be written only after the consultation has ended.',
      };
    }
    if (doctor.isDemo) {
      if (!isDemoVideoTestParticipant(doctor, appointment.patientId)) {
        return {
          canPrescribe: false,
          code: 'DEMO_NOT_PERMITTED',
          message: 'Demo doctors can prescribe only for the authorized local video test patient.',
        };
      }
    } else if (!doctor.isVerified && !(doctor.isStagingFixture && stagingFixturesEnabled())) {
      return {
        canPrescribe: false,
        code: 'DOCTOR_NOT_VERIFIED',
        message: 'Only a verified doctor can issue prescriptions.',
      };
    }
    return { canPrescribe: true, code: null, message: null };
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private requireEligible(eligibility: PrescriptionEligibility): void {
    if (eligibility.canPrescribe) return;
    throw new (
      eligibility.code === 'CONSULTATION_NOT_COMPLETED' ? ConflictException : ForbiddenException
    )({
      code: eligibility.code,
      message: eligibility.message,
    });
  }

  /** Completeness rules that apply to an issued prescription but not to a work-in-progress draft. */
  private requireIssuable(rx: ClinicalPrescription, appointment: Appointment): void {
    const problems: Record<string, string[]> = {};
    if (!rx.diagnosis?.trim())
      problems.diagnosis = ['A diagnosis or clinical assessment is required.'];
    if (!rx.medicines?.length) problems.medicines = ['Add at least one medicine.'];
    if (rx.followUpDate) {
      const consultDate = appointment.slot?.date;
      if (consultDate && rx.followUpDate < consultDate) {
        problems.followUpDate = ['The follow-up date cannot be before the consultation.'];
      } else if (rx.followUpDate > addDays(todayInClinic(), 366)) {
        problems.followUpDate = ['The follow-up date is more than a year away.'];
      }
    }
    if (Object.keys(problems).length) {
      throw new BadRequestException({
        code: 'PRESCRIPTION_INCOMPLETE',
        message: 'The prescription is incomplete.',
        details: problems,
      });
    }
  }

  private async requireDoctor(userId: string): Promise<Doctor> {
    const doctor = await this.doctors.findOne({ where: { userId }, relations: { user: true } });
    if (!doctor) {
      throw new ForbiddenException({
        code: 'NOT_A_DOCTOR',
        message: 'Only a doctor can manage prescriptions.',
      });
    }
    return doctor;
  }

  private loadAppointment(id: string): Promise<Appointment> {
    return this.appointments
      .findOne({ where: { id }, relations: { doctor: { user: true }, patient: true, slot: true } })
      .then((a) => {
        if (!a) throw this.notFound();
        return a;
      });
  }

  /** The appointment must exist AND belong to the authenticated doctor; anything else is "not found". */
  private async loadOwnedAppointment(
    doctorUserId: string,
    appointmentId: string,
  ): Promise<{ appointment: Appointment; doctor: Doctor }> {
    const doctor = await this.requireDoctor(doctorUserId);
    const appointment = await this.appointments.findOne({
      where: { id: appointmentId, doctorId: doctor.id },
      relations: { doctor: { user: true }, patient: true, slot: true },
    });
    if (!appointment) {
      throw new NotFoundException({
        code: 'APPOINTMENT_NOT_FOUND',
        message: 'Appointment not found.',
      });
    }
    return { appointment, doctor: appointment.doctor ?? doctor };
  }

  /** Row-locks a prescription that belongs to this doctor; foreign ids look exactly like missing ones. */
  private async lockOwned(
    manager: EntityManager,
    id: string,
    doctor: Doctor,
  ): Promise<ClinicalPrescription> {
    const rx = await manager.findOne(ClinicalPrescription, {
      where: { id, doctorId: doctor.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!rx) throw this.notFound();
    return rx;
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'PRESCRIPTION_NOT_FOUND',
      message: 'Prescription not found.',
    });
  }

  private contentColumns(content: ClinicalContent) {
    return {
      diagnosis: content.diagnosis,
      medicines: content.medicines,
      recommendedTests: content.recommendedTests,
      additionalInstructions: content.additionalInstructions,
      warnings: content.warnings,
      followUpDate: content.followUpDate,
    };
  }

  /**
   * Turns validated client input into stored content. A catalog id is resolved server-side: the name and generic
   * name then come from the catalog, never from the client. Entries without a catalog id are stored as manual.
   */
  private async buildContent(dto: SaveDraftDto): Promise<ClinicalContent> {
    const ids = [
      ...new Set(dto.medicines.map((m) => m.catalogMedicineId).filter((v): v is string => !!v)),
    ];
    const catalog = new Map<string, Variant>();
    if (ids.length) {
      const found = await this.variants.find({
        where: { id: In(ids) },
        relations: { medicine: { generic: true } },
      });
      for (const v of found) catalog.set(v.id, v);
      const missing = ids.filter(
        (i) => !catalog.has(i) || catalog.get(i)!.medicine?.isActive === false,
      );
      if (missing.length) {
        throw new BadRequestException({
          code: 'UNKNOWN_CATALOG_MEDICINE',
          message: 'A selected medicine is not in the catalog. Pick another or enter it manually.',
          details: { medicines: missing },
        });
      }
    }
    const medicines = dto.medicines.map((m) => this.toStoredMedicine(m, catalog));
    const testIds = [...new Set(dto.recommendedTests.map((t) => t.labTestId))];
    const labTests = testIds.length
      ? await this.dataSource.getRepository(LabTest).find({ where: { id: In(testIds), isActive: true } })
      : [];
    const testsById = new Map(labTests.map((test) => [test.id, test]));
    if (testsById.size !== testIds.length) {
      throw new BadRequestException({
        code: 'UNKNOWN_CATALOG_TEST',
        message: 'A selected lab test is no longer in the active catalog. Search and select it again.',
      });
    }
    const recommendedTests = dto.recommendedTests.map((input) =>
      this.toStoredTest(input, testsById.get(input.labTestId)!),
    );
    return {
      diagnosis: dto.diagnosis,
      medicines,
      recommendedTests,
      additionalInstructions: dto.additionalInstructions,
      warnings: dto.warnings,
      followUpDate: dto.followUpDate,
    };
  }

  async searchLabTests(query: SearchPrescriptionLabTestsDto) {
    const escaped = query.search.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);
    const rows = await this.dataSource
      .getRepository(LabTest)
      .createQueryBuilder('test')
      .where('test.isActive = true')
      .andWhere('LOWER(test.name) LIKE :q', { q: `%${escaped}%` })
      .orderBy('test.name', 'ASC')
      .take(12)
      .getMany();
    return rows.map((test) => ({ id: test.id, name: test.name, category: test.category, isDemo: test.isDemo }));
  }

  private toStoredTest(input: PrescribedTestInput, test: LabTest): PrescribedTest {
    return {
      labTestId: test.id,
      name: test.name,
      preparationInstructions: test.preparationInstructions || null,
      clinicalInstructions: input.clinicalInstructions,
    };
  }

  private toStoredMedicine(
    m: PrescribedMedicineInput,
    catalog: Map<string, Variant>,
  ): PrescribedMedicine {
    const entry = m.catalogMedicineId ? catalog.get(m.catalogMedicineId) : undefined;
    return {
      catalogMedicineId: entry ? entry.id : null,
      source: entry ? 'catalog' : 'manual',
      name: entry ? entry.medicine.name : m.name,
      genericName: entry ? (entry.medicine.generic?.name ?? null) : null,
      strength: m.strength,
      dosageForm: m.dosageForm,
      dose: m.dose,
      route: m.route,
      frequency: m.frequency,
      durationValue: m.durationValue,
      durationUnit: m.durationUnit,
      quantity: m.quantity,
      quantityUnit: m.quantityUnit,
      timing: [...new Set(m.timing)],
      foodRelation: m.foodRelation,
      instructions: m.instructions,
    };
  }

  private recordEvent(
    manager: EntityManager,
    rx: ClinicalPrescription,
    actorUserId: string,
    action: ClinicalPrescriptionAction,
    extra: { from?: string; to?: string; metadata?: Record<string, unknown> } = {},
  ) {
    return manager.save(
      ClinicalPrescriptionEvent,
      manager.create(ClinicalPrescriptionEvent, {
        prescriptionId: rx.id,
        appointmentId: rx.appointmentId,
        actorUserId,
        action,
        fromStatus: extra.from ?? null,
        toStatus: extra.to ?? null,
        metadata: extra.metadata ?? null,
      }),
    );
  }

  /** Queues only generic text and the opaque prescription reference; no clinical details leave the record. */
  private enqueuePatientNotification(manager: EntityManager, rx: ClinicalPrescription) {
    return manager.save(
      NotificationOutbox,
      manager.create(NotificationOutbox, {
        eventKey: `prescription-issued:${rx.id}`,
        userId: rx.patientId,
        type: NotificationType.PRESCRIPTION_ISSUED,
        title: 'New prescription available',
        body: 'Your doctor has issued a prescription. Tap to view it.',
        data: { prescriptionId: rx.id },
        attempts: 0,
        deliveredAt: null,
      }),
    );
  }

  /** Materializes one outbox entry after the prescription transaction has committed. */
  private async deliverNotificationOutbox(id: string): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        const outbox = await manager.findOne(NotificationOutbox, {
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!outbox || outbox.deliveredAt) return;

        await manager.save(
          Notification,
          manager.create(Notification, {
            userId: outbox.userId,
            type: NotificationType.PRESCRIPTION_ISSUED,
            title: outbox.title,
            body: outbox.body,
            data: outbox.data ?? undefined,
            isRead: false,
          }),
        );
        outbox.attempts = (outbox.attempts ?? 0) + 1;
        outbox.deliveredAt = new Date();
        await manager.save(NotificationOutbox, outbox);
      });
    } catch {
      // The prescription is already committed. Leave the outbox pending for a later retry.
      this.logger.warn('In-app notification delivery failed; it will be retried.');
    }
  }

  /** Retries durable events left pending by a database error after prescription issuance. */
  async retryPendingNotificationOutbox(): Promise<void> {
    try {
      const pending = await this.dataSource.transaction((manager) =>
        manager.find(NotificationOutbox, {
          where: { deliveredAt: IsNull() },
          order: { createdAt: 'ASC' },
          take: 25,
        }),
      );
      for (const item of pending) await this.deliverNotificationOutbox(item.id);
    } catch {
      this.logger.warn('In-app notification retry scan failed.');
    }
  }

  // ── Views ─────────────────────────────────────────────────────────────────

  private toDoctorView(
    rx: ClinicalPrescription,
    appointment: Appointment,
    doctor: Doctor,
  ): DoctorPrescriptionView {
    return {
      id: rx.id,
      reference: prescriptionReference(rx.id, rx.version),
      status: rx.status,
      version: rx.version,
      revision: rx.revision,
      diagnosis: rx.diagnosis ?? null,
      medicines: rx.medicines ?? [],
      recommendedTests: rx.recommendedTests ?? [],
      additionalInstructions: rx.additionalInstructions ?? null,
      warnings: rx.warnings ?? null,
      followUpDate: rx.followUpDate ?? null,
      consultation: {
        appointmentId: appointment.id,
        date: appointment.slot?.date,
        startTime: appointment.slot?.startTime,
        endTime: appointment.slot?.endTime,
      },
      patient: { id: appointment.patientId, name: appointment.patient?.name ?? 'Patient' },
      issuedAt: rx.issuedAt ? new Date(rx.issuedAt).toISOString() : null,
      doctor: rx.doctorSnapshot ?? snapshotDoctor(doctor),
      supersedesId: rx.supersedesId ?? null,
      supersededById: rx.supersededById ?? null,
      amendmentReason: rx.amendmentReason ?? null,
      cancelledAt: rx.cancelledAt ? new Date(rx.cancelledAt).toISOString() : null,
      cancellationReason: rx.cancellationReason ?? null,
      digitallySigned: false,
      createdAt: new Date(rx.createdAt).toISOString(),
      updatedAt: new Date(rx.updatedAt).toISOString(),
    };
  }

  private toPatientView(rx: ClinicalPrescription): PatientPrescriptionView {
    const status = rx.status as PatientPrescriptionView['status'];
    return {
      id: rx.id,
      reference: prescriptionReference(rx.id, rx.version),
      status,
      version: rx.version,
      diagnosis: rx.diagnosis ?? null,
      medicines: rx.medicines ?? [],
      recommendedTests: rx.recommendedTests ?? [],
      additionalInstructions: rx.additionalInstructions ?? null,
      warnings: rx.warnings ?? null,
      followUpDate: rx.followUpDate ?? null,
      consultation: {
        appointmentId: rx.appointmentId,
        date: rx.appointment?.slot?.date,
        startTime: rx.appointment?.slot?.startTime,
        endTime: rx.appointment?.slot?.endTime,
      },
      patient: {
        name: rx.patient?.name ?? 'Patient',
        age: ageOn(rx.patient?.dob),
        gender: rx.patient?.gender ?? null,
      },
      issuedAt: new Date(rx.issuedAt as Date).toISOString(),
      // Frozen at issue time; a prescription is never shown with today's profile data.
      doctor: rx.doctorSnapshot!,
      supersededById: rx.supersededById ?? null,
      amendmentReason: rx.amendmentReason ?? null,
      cancelledAt: rx.cancelledAt ? new Date(rx.cancelledAt).toISOString() : null,
      cancellationReason: rx.cancellationReason ?? null,
      digitallySigned: false,
    };
  }
}
