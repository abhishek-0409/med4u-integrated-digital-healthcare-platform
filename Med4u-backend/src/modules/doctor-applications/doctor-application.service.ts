import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { PaginatedResponse } from '../../common/utils/pagination.util';
import { Appointment } from '../../database/entities/appointment.entity';
import { Doctor } from '../../database/entities/doctor.entity';
import {
  ApplicationDocumentKind,
  DoctorApplicationDocument,
} from '../../database/entities/doctor-application-document.entity';
import {
  ApplicationEventAction,
  DoctorApplicationEvent,
} from '../../database/entities/doctor-application-event.entity';
import {
  DoctorApplication,
  DoctorApplicationStatus as S,
} from '../../database/entities/doctor-application.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { DoctorService } from '../doctors/doctor.service';
import {
  ValidatedDocument,
  validateDocument,
} from './application-document.util';
import {
  REVIEW_TARGET_NOTE,
  STATUS_LABEL,
  canResubmit,
  canReview,
  canStartReview,
  computeReviewDeadline,
  isReviewOverdue,
} from './application-workflow';
import {
  ApplicationFieldsDto,
  ApproveApplicationDto,
  ListApplicationsQueryDto,
  RejectApplicationDto,
  RequestInfoDto,
  ResubmitFieldsDto,
} from './dto/doctor-application.dto';
import { DoctorDocumentStorageService } from './doctor-document-storage.service';

export interface Actor {
  id: string;
  role: UserRole;
}

export interface UploadedDocs {
  graduationCertificate?: Express.Multer.File;
  registrationCertificate?: Express.Multer.File;
}

export interface DocumentView {
  id: string;
  kind: ApplicationDocumentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
}

export interface ApplicantApplicationView {
  id: string;
  status: S;
  statusLabel: string;
  submittedAt: Date;
  reviewDeadlineAt: Date;
  /** The 24-hour target has passed and a reviewer has not yet decided. Informational only. */
  reviewOverdue: boolean;
  reviewTargetNote: string;
  fullName: string;
  email: string;
  /** This system cannot verify email addresses; the value is contact information only. */
  emailVerified: false;
  registrationNumber: string;
  registrationCouncil: string;
  qualification: string;
  medicalCollege: string;
  specialization: string;
  clinicName: string;
  clinicAddress: string;
  city: string;
  consultationMode: string;
  /** Present for NEEDS_INFO and REJECTED: what the reviewer asked for / why. */
  applicantMessage: string | null;
  canResubmit: boolean;
  resubmissionCount: number;
  documents: DocumentView[];
  /** No notification service is configured; applicants check this status instead. */
  notifications: 'not_configured';
}

export interface AdminApplicationSummary {
  id: string;
  status: S;
  statusLabel: string;
  applicantUserId: string;
  fullName: string;
  registrationCouncil: string;
  registrationNumber: string;
  specialization: string;
  submittedAt: Date;
  reviewDeadlineAt: Date;
  reviewOverdue: boolean;
  resubmissionCount: number;
}

export interface AdminApplicationDetail extends AdminApplicationSummary {
  applicantPhone: string;
  email: string;
  emailVerified: false;
  qualification: string;
  medicalCollege: string;
  clinicName: string;
  clinicAddress: string;
  city: string;
  consultationMode: string;
  reviewerId: string | null;
  decidedAt: Date | null;
  reviewerNotes: string | null;
  applicantMessage: string | null;
  registryCheck: string | null;
  registrySource: string | null;
  registryReference: string | null;
  doctorId: string | null;
  documents: DocumentView[];
  events: Array<{
    id: string;
    action: ApplicationEventAction;
    actorUserId: string;
    actorRole: string;
    fromStatus: string | null;
    toStatus: string | null;
    note: string | null;
    applicantMessage: string | null;
    createdAt: Date;
  }>;
  /** Verification is a human task. Nothing here asserts that a document is authentic. */
  verificationNote: string;
}

const DOC_FIELDS: Array<[keyof UploadedDocs, ApplicationDocumentKind, string]> = [
  ['graduationCertificate', ApplicationDocumentKind.GRADUATION_CERTIFICATE, 'Graduation certificate'],
  ['registrationCertificate', ApplicationDocumentKind.REGISTRATION_CERTIFICATE, 'Medical registration certificate'],
];

/** Rejected applications' files are deleted this long after the decision (the row and audit trail remain). */
export const REJECTED_DOCUMENT_RETENTION_DAYS = 90;

const isUniqueViolation = (err: unknown): boolean =>
  (err as { code?: string; driverError?: { code?: string } })?.code === '23505' ||
  (err as { driverError?: { code?: string } })?.driverError?.code === '23505';

@Injectable()
export class DoctorApplicationService {
  private readonly logger = new Logger(DoctorApplicationService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly storage: DoctorDocumentStorageService,
    private readonly doctors: DoctorService,
  ) {}

  // ── Applicant ──────────────────────────────────────────────────────────────

  async submit(
    userId: string,
    fields: ApplicationFieldsDto,
    files: UploadedDocs,
  ): Promise<ApplicantApplicationView> {
    const docs = this.validateAllDocuments(files, true);
    const user = await this.dataSource.getRepository(User).findOne({ where: { id: userId } });
    if (!user || !user.isActive) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Account unavailable.' });
    if (user.role !== UserRole.PATIENT) {
      throw new ForbiddenException({
        code: 'APPLICATION_NOT_ALLOWED',
        message: 'Only a regular account can apply to become a doctor.',
      });
    }
    const existing = await this.dataSource
      .getRepository(DoctorApplication)
      .findOne({ where: { userId }, withDeleted: true });
    if (existing) {
      throw new ConflictException({
        code: 'APPLICATION_EXISTS',
        message: 'You already have a doctor application. Open it to see its status.',
      });
    }
    await this.assertRegistrationUnused(this.dataSource.manager, fields.registrationCouncil, fields.registrationNumber);

    const storedKeys: string[] = [];
    try {
      const stored = await this.storeAll(docs, storedKeys);
      const now = new Date();
      const application = await this.dataSource.transaction(async (em) => {
        const saved = await em.getRepository(DoctorApplication).save(
          em.getRepository(DoctorApplication).create({
            ...fields,
            userId,
            status: S.PENDING_VERIFICATION,
            submittedAt: now,
            reviewDeadlineAt: computeReviewDeadline(now),
          }),
        );
        await em.getRepository(DoctorApplicationDocument).save(
          stored.map(({ kind, doc, storageKey }) =>
            em.getRepository(DoctorApplicationDocument).create({
              applicationId: saved.id,
              kind,
              storageKey,
              originalName: doc.displayName,
              mimeType: doc.mimeType,
              sizeBytes: doc.sizeBytes,
              sha256: doc.sha256,
            }),
          ),
        );
        await this.recordEvent(em, saved.id, { id: userId, role: user.role }, ApplicationEventAction.SUBMITTED, {
          toStatus: S.PENDING_VERIFICATION,
        });
        return saved;
      });
      this.logger.log(`Doctor application ${application.id} submitted`);
      return this.getMine(userId);
    } catch (err) {
      await this.removeKeys(storedKeys);
      if (isUniqueViolation(err)) throw this.registrationConflict();
      throw err;
    }
  }

  async getMine(userId: string): Promise<ApplicantApplicationView> {
    const application = await this.dataSource.getRepository(DoctorApplication).findOne({ where: { userId } });
    if (!application) {
      throw new NotFoundException({ code: 'APPLICATION_NOT_FOUND', message: 'You have not submitted a doctor application.' });
    }
    const documents = await this.currentDocuments(this.dataSource.manager, application.id);
    return this.toApplicantView(application, documents);
  }

  async resubmit(
    userId: string,
    fields: ResubmitFieldsDto,
    files: UploadedDocs,
  ): Promise<ApplicantApplicationView> {
    const docs = this.validateAllDocuments(files, false);
    const changedFields = Object.keys(fields).length;
    if (changedFields === 0 && docs.length === 0) {
      throw new BadRequestException({
        code: 'NOTHING_TO_RESUBMIT',
        message: 'Update at least one detail or attach a replacement document.',
      });
    }

    const storedKeys: string[] = [];
    const supersededKeys: string[] = [];
    try {
      const stored = await this.storeAll(docs, storedKeys);
      await this.dataSource.transaction(async (em) => {
        const application = await em
          .getRepository(DoctorApplication)
          .findOne({ where: { userId }, lock: { mode: 'pessimistic_write' } });
        if (!application) throw new NotFoundException({ code: 'APPLICATION_NOT_FOUND', message: 'No application found.' });
        if (!canResubmit(application.status, application.resubmissionAllowed)) {
          throw new ConflictException({
            code: 'RESUBMISSION_NOT_ALLOWED',
            message: 'This application cannot be resubmitted right now.',
          });
        }
        const next = { ...fields };
        if (next.registrationCouncil || next.registrationNumber) {
          await this.assertRegistrationUnused(
            em,
            next.registrationCouncil ?? application.registrationCouncil,
            next.registrationNumber ?? application.registrationNumber,
            application.id,
          );
        }
        for (const { kind, doc, storageKey } of stored) {
          const current = await em
            .getRepository(DoctorApplicationDocument)
            .findOne({ where: { applicationId: application.id, kind, supersededAt: IsNull() } });
          if (current) {
            await em.getRepository(DoctorApplicationDocument).update(current.id, { supersededAt: new Date() });
            supersededKeys.push(current.storageKey);
          }
          await em.getRepository(DoctorApplicationDocument).save(
            em.getRepository(DoctorApplicationDocument).create({
              applicationId: application.id,
              kind,
              storageKey,
              originalName: doc.displayName,
              mimeType: doc.mimeType,
              sizeBytes: doc.sizeBytes,
              sha256: doc.sha256,
            }),
          );
        }
        const fromStatus = application.status;
        const now = new Date();
        Object.assign(application, next, {
          status: S.PENDING_VERIFICATION,
          submittedAt: now,
          reviewDeadlineAt: computeReviewDeadline(now),
          resubmissionCount: application.resubmissionCount + 1,
          resubmissionAllowed: false,
          // The previous decision stays in the audit trail; the live row is a clean pending application again.
          reviewerId: null,
          decidedAt: null,
          reviewerNotes: null,
          applicantMessage: null,
        });
        await em.getRepository(DoctorApplication).save(application);
        await this.recordEvent(em, application.id, { id: userId, role: UserRole.PATIENT }, ApplicationEventAction.RESUBMITTED, {
          fromStatus,
          toStatus: S.PENDING_VERIFICATION,
          metadata: { fieldsChanged: Object.keys(fields), documentsReplaced: stored.map((s) => s.kind) },
        });
      });
      // Replaced files are deleted only after the new state is committed.
      await this.purgeKeys(supersededKeys);
      return this.getMine(userId);
    } catch (err) {
      await this.removeKeys(storedKeys);
      if (isUniqueViolation(err)) throw this.registrationConflict();
      throw err;
    }
  }

  /** The applicant's own current document, or 404 (never reveals other users' documents). */
  async readOwnDocument(userId: string, documentId: string) {
    const doc = await this.dataSource
      .getRepository(DoctorApplicationDocument)
      .createQueryBuilder('d')
      .innerJoin(DoctorApplication, 'a', 'a.id = d.application_id')
      .where('d.id = :documentId AND a.user_id = :userId', { documentId, userId })
      .andWhere('d.superseded_at IS NULL AND d.purged_at IS NULL')
      .getOne();
    if (!doc) throw this.documentNotFound();
    return this.openDocument(doc);
  }

  // ── Reviewer (admin) ───────────────────────────────────────────────────────

  async list(query: ListApplicationsQueryDto): Promise<PaginatedResponse<AdminApplicationSummary>> {
    const statuses = query.status ? [query.status as S] : [S.PENDING_VERIFICATION, S.UNDER_REVIEW];
    const [rows, total] = await this.dataSource.getRepository(DoctorApplication).findAndCount({
      where: { status: In(statuses) },
      order: { reviewDeadlineAt: 'ASC', id: 'ASC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return new PaginatedResponse(rows.map((r) => this.toSummary(r)), total, query.page, query.limit);
  }

  async getForReview(id: string): Promise<AdminApplicationDetail> {
    const application = await this.requireApplication(this.dataSource.manager, id);
    return this.toDetail(this.dataSource.manager, application);
  }

  async readDocumentForReview(actor: Actor, applicationId: string, documentId: string) {
    const doc = await this.dataSource
      .getRepository(DoctorApplicationDocument)
      .findOne({ where: { id: documentId, applicationId } });
    if (!doc || doc.purgedAt) throw this.documentNotFound();
    const opened = await this.openDocument(doc);
    // Every reviewer access to a certificate is part of the audit trail.
    await this.recordEvent(this.dataSource.manager, applicationId, actor, ApplicationEventAction.DOCUMENT_VIEWED, {
      metadata: { documentId: doc.id, kind: doc.kind },
    });
    return opened;
  }

  async startReview(actor: Actor, id: string): Promise<AdminApplicationDetail> {
    await this.dataSource.transaction(async (em) => {
      const application = await this.lockApplication(em, id);
      this.assertNotOwnApplication(actor, application);
      if (!canStartReview(application.status)) {
        throw this.invalidTransition(application.status);
      }
      application.status = S.UNDER_REVIEW;
      application.reviewerId = actor.id;
      await em.getRepository(DoctorApplication).save(application);
      await this.recordEvent(em, id, actor, ApplicationEventAction.REVIEW_STARTED, {
        fromStatus: S.PENDING_VERIFICATION,
        toStatus: S.UNDER_REVIEW,
      });
    });
    return this.getForReview(id);
  }

  async requestInfo(actor: Actor, id: string, dto: RequestInfoDto): Promise<AdminApplicationDetail> {
    await this.dataSource.transaction(async (em) => {
      const application = await this.lockApplication(em, id);
      this.assertNotOwnApplication(actor, application);
      if (!canReview(application.status)) throw this.invalidTransition(application.status);
      const fromStatus = application.status;
      Object.assign(application, {
        status: S.NEEDS_INFO,
        reviewerId: actor.id,
        decidedAt: new Date(),
        applicantMessage: dto.message,
        reviewerNotes: dto.notes ?? null,
        resubmissionAllowed: true,
      });
      await em.getRepository(DoctorApplication).save(application);
      await this.recordEvent(em, id, actor, ApplicationEventAction.INFO_REQUESTED, {
        fromStatus,
        toStatus: S.NEEDS_INFO,
        note: dto.notes,
        applicantMessage: dto.message,
      });
    });
    return this.getForReview(id);
  }

  async reject(actor: Actor, id: string, dto: RejectApplicationDto): Promise<AdminApplicationDetail> {
    await this.dataSource.transaction(async (em) => {
      const application = await this.lockApplication(em, id);
      this.assertNotOwnApplication(actor, application);
      if (!canReview(application.status)) throw this.invalidTransition(application.status);
      const fromStatus = application.status;
      Object.assign(application, {
        status: S.REJECTED,
        reviewerId: actor.id,
        decidedAt: new Date(),
        applicantMessage: dto.reason,
        reviewerNotes: dto.notes ?? null,
        resubmissionAllowed: dto.allowResubmission,
      });
      await em.getRepository(DoctorApplication).save(application);
      await this.recordEvent(em, id, actor, ApplicationEventAction.REJECTED, {
        fromStatus,
        toStatus: S.REJECTED,
        note: dto.notes,
        applicantMessage: dto.reason,
        metadata: { allowResubmission: dto.allowResubmission },
      });
    });
    return this.getForReview(id);
  }

  /**
   * The ONLY place a doctors row is created from an application. It runs in one transaction with the status
   * change, and only for an application a human reviewer has reviewed and attested to (registry check recorded).
   */
  async approve(actor: Actor, id: string, dto: ApproveApplicationDto): Promise<AdminApplicationDetail> {
    try {
      await this.dataSource.transaction(async (em) => {
        const application = await this.lockApplication(em, id);
        this.assertNotOwnApplication(actor, application);
        if (!canReview(application.status)) throw this.invalidTransition(application.status);

        const user = await em.getRepository(User).findOne({ where: { id: application.userId }, lock: { mode: 'pessimistic_write' } });
        if (!user || !user.isActive) {
          throw new ConflictException({ code: 'APPLICANT_UNAVAILABLE', message: 'The applicant account is not active.' });
        }
        if (user.role !== UserRole.PATIENT) {
          throw new ConflictException({
            code: 'APPLICANT_ROLE_CONFLICT',
            message: 'The applicant account already has a staff role and cannot be converted.',
          });
        }
        // Changing a role would orphan an existing patient's own bookings, so a human must resolve that first.
        const patientHistory = await em.getRepository(Appointment).count({ where: { patientId: user.id } });
        if (patientHistory > 0) {
          throw new ConflictException({
            code: 'PATIENT_HISTORY_CONFLICT',
            message: 'The applicant has patient appointments on this account. Resolve them before approving.',
          });
        }
        if (await em.getRepository(Doctor).findOne({ where: { userId: user.id }, withDeleted: true })) {
          throw new ConflictException({ code: 'DOCTOR_PROFILE_EXISTS', message: 'A doctor profile already exists for this account.' });
        }

        const now = new Date();
        const doctor = await em.getRepository(Doctor).save(
          em.getRepository(Doctor).create({
            userId: user.id,
            specialization: application.specialization,
            licenseNumber: application.registrationNumber,
            registrationNumber: application.registrationNumber,
            registrationCouncil: application.registrationCouncil,
            experienceYears: null,
            consultationFee: null,
            languages: [],
            education: [{ degree: application.qualification, institution: application.medicalCollege }],
            availabilitySchedule: {},
            city: application.city,
            address: application.clinicAddress,
            clinicName: application.clinicName,
            consultationMode: application.consultationMode,
            isVerified: true,
            isDemo: false,
            isStagingFixture: false,
            verificationStatus: 'verified',
            verifiedAt: now,
            verifiedBy: actor.id,
            verificationMethod: 'manual_document_review',
            verificationReference: application.id,
            profileSource: 'doctor_application',
          }),
        );
        await em.getRepository(User).update(user.id, { role: UserRole.DOCTOR, name: application.fullName, isVerified: true });

        const fromStatus = application.status;
        Object.assign(application, {
          status: S.APPROVED,
          reviewerId: actor.id,
          decidedAt: now,
          reviewerNotes: dto.notes,
          applicantMessage: null,
          resubmissionAllowed: false,
          registryCheck: dto.registryCheck,
          registrySource: dto.registrySource ?? null,
          registryReference: dto.registryReference ?? dto.registryUnavailableReason ?? null,
          doctorId: doctor.id,
        });
        await em.getRepository(DoctorApplication).save(application);
        await this.recordEvent(em, id, actor, ApplicationEventAction.APPROVED, {
          fromStatus,
          toStatus: S.APPROVED,
          note: dto.notes,
          metadata: {
            registryCheck: dto.registryCheck,
            registrySource: dto.registrySource ?? null,
            registryUnavailableReason: dto.registryUnavailableReason ?? null,
            doctorId: doctor.id,
          },
        });
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw this.registrationConflict();
      throw err;
    }
    await this.doctors.invalidateDoctorListCache().catch(() => undefined);
    return this.getForReview(id);
  }

  // ── Retention ──────────────────────────────────────────────────────────────

  /**
   * Deletes the stored bytes of REJECTED applications decided more than `days` ago and not open to
   * resubmission. Rows and the audit trail are kept. Returns how many files were (or would be) removed.
   */
  async purgeRejectedDocuments(days = REJECTED_DOCUMENT_RETENTION_DAYS, dryRun = true, now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const docs = await this.dataSource
      .getRepository(DoctorApplicationDocument)
      .createQueryBuilder('d')
      .innerJoin(DoctorApplication, 'a', 'a.id = d.application_id')
      .where('a.status = :s AND a.resubmission_allowed = false AND a.decided_at < :cutoff', { s: S.REJECTED, cutoff })
      .andWhere('d.purged_at IS NULL')
      .getMany();
    if (!dryRun) await this.purgeDocuments(docs);
    return docs.length;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private validateAllDocuments(files: UploadedDocs, requireAll: boolean) {
    const out: Array<{ kind: ApplicationDocumentKind; doc: ValidatedDocument }> = [];
    for (const [field, kind, label] of DOC_FIELDS) {
      const file = files[field];
      if (!file && !requireAll) continue;
      out.push({ kind, doc: validateDocument(file, label) });
    }
    return out;
  }

  private async storeAll(docs: Array<{ kind: ApplicationDocumentKind; doc: ValidatedDocument }>, keys: string[]) {
    const stored: Array<{ kind: ApplicationDocumentKind; doc: ValidatedDocument; storageKey: string }> = [];
    for (const { kind, doc } of docs) {
      const storageKey = await this.storage.save(doc.buffer);
      keys.push(storageKey);
      stored.push({ kind, doc, storageKey });
    }
    return stored;
  }

  private async removeKeys(keys: string[]): Promise<void> {
    await Promise.all(keys.map((k) => this.storage.remove(k).catch(() => undefined)));
  }

  private async purgeKeys(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const docs = await this.dataSource.getRepository(DoctorApplicationDocument).find({ where: { storageKey: In(keys) } });
    await this.purgeDocuments(docs);
  }

  private async purgeDocuments(docs: DoctorApplicationDocument[]): Promise<void> {
    for (const doc of docs) {
      await this.storage.remove(doc.storageKey).catch((err) => {
        this.logger.warn(`Could not delete document file ${doc.id}: ${(err as Error).message}`);
      });
      await this.dataSource.getRepository(DoctorApplicationDocument).update(doc.id, { purgedAt: new Date() });
    }
  }

  private async openDocument(doc: DoctorApplicationDocument) {
    try {
      return { data: await this.storage.read(doc.storageKey), mimeType: doc.mimeType, kind: doc.kind };
    } catch (err) {
      if ((err as { status?: number }).status === 503) throw err;
      // Missing or undecryptable file: do not leak details.
      this.logger.error(`Document ${doc.id} could not be read`);
      throw this.documentNotFound();
    }
  }

  private async assertRegistrationUnused(
    em: EntityManager,
    council: string,
    number: string,
    exceptApplicationId?: string,
  ): Promise<void> {
    const dup = await em
      .getRepository(DoctorApplication)
      .createQueryBuilder('a')
      .where('lower(a.registration_council) = lower(:council) AND upper(a.registration_number) = upper(:number)', { council, number })
      .andWhere("a.status <> 'REJECTED' AND a.deleted_at IS NULL")
      .andWhere(exceptApplicationId ? 'a.id <> :except' : '1=1', { except: exceptApplicationId })
      .getCount();
    const doctor = await em
      .getRepository(Doctor)
      .createQueryBuilder('d')
      .where('lower(d.registration_council) = lower(:council) AND upper(d.registration_number) = upper(:number)', { council, number })
      .getCount();
    if (dup + doctor > 0) throw this.registrationConflict();
  }

  private registrationConflict() {
    return new ConflictException({
      code: 'REGISTRATION_ALREADY_USED',
      message: 'This registration number is already linked to an application or a doctor profile. Contact support if this is a mistake.',
    });
  }

  private invalidTransition(status: S) {
    return new ConflictException({
      code: 'INVALID_STATUS_TRANSITION',
      message: `This application is ${STATUS_LABEL[status].toLowerCase()} and cannot take that action.`,
    });
  }

  private documentNotFound() {
    return new NotFoundException({ code: 'DOCUMENT_NOT_FOUND', message: 'Document not found.' });
  }

  private assertNotOwnApplication(actor: Actor, application: DoctorApplication) {
    if (actor.id === application.userId) {
      throw new ForbiddenException({
        code: 'SELF_REVIEW_FORBIDDEN',
        message: 'You cannot review your own application.',
      });
    }
  }

  private async requireApplication(em: EntityManager, id: string) {
    const application = await em.getRepository(DoctorApplication).findOne({ where: { id } });
    if (!application) throw new NotFoundException({ code: 'APPLICATION_NOT_FOUND', message: 'Application not found.' });
    return application;
  }

  private async lockApplication(em: EntityManager, id: string) {
    const application = await em
      .getRepository(DoctorApplication)
      .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!application) throw new NotFoundException({ code: 'APPLICATION_NOT_FOUND', message: 'Application not found.' });
    return application;
  }

  private currentDocuments(em: EntityManager, applicationId: string) {
    return em.getRepository(DoctorApplicationDocument).find({
      where: { applicationId, supersededAt: IsNull(), purgedAt: IsNull() },
      order: { kind: 'ASC' },
    });
  }

  private async recordEvent(
    em: EntityManager,
    applicationId: string,
    actor: Actor,
    action: ApplicationEventAction,
    extra: {
      fromStatus?: string | null;
      toStatus?: string | null;
      note?: string | null;
      applicantMessage?: string | null;
      metadata?: Record<string, unknown>;
    } = {},
  ): Promise<void> {
    const repo = em.getRepository(DoctorApplicationEvent);
    await repo.save(
      repo.create({
        applicationId,
        actorUserId: actor.id,
        actorRole: actor.role,
        action,
        fromStatus: extra.fromStatus ?? null,
        toStatus: extra.toStatus ?? null,
        note: extra.note ?? null,
        applicantMessage: extra.applicantMessage ?? null,
        metadata: extra.metadata ?? null,
      }),
    );
  }

  private toDocumentView(d: DoctorApplicationDocument): DocumentView {
    return {
      id: d.id,
      kind: d.kind,
      fileName: d.originalName,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      uploadedAt: d.createdAt,
    };
  }

  private toApplicantView(a: DoctorApplication, documents: DoctorApplicationDocument[]): ApplicantApplicationView {
    const showMessage = a.status === S.NEEDS_INFO || a.status === S.REJECTED;
    return {
      id: a.id,
      status: a.status,
      statusLabel: STATUS_LABEL[a.status],
      submittedAt: a.submittedAt,
      reviewDeadlineAt: a.reviewDeadlineAt,
      reviewOverdue: isReviewOverdue(a.status, a.reviewDeadlineAt),
      reviewTargetNote: REVIEW_TARGET_NOTE,
      fullName: a.fullName,
      email: a.email,
      emailVerified: false,
      registrationNumber: a.registrationNumber,
      registrationCouncil: a.registrationCouncil,
      qualification: a.qualification,
      medicalCollege: a.medicalCollege,
      specialization: a.specialization,
      clinicName: a.clinicName,
      clinicAddress: a.clinicAddress,
      city: a.city,
      consultationMode: a.consultationMode,
      applicantMessage: showMessage ? a.applicantMessage ?? null : null,
      canResubmit: canResubmit(a.status, a.resubmissionAllowed),
      resubmissionCount: a.resubmissionCount,
      documents: documents.map((d) => this.toDocumentView(d)),
      notifications: 'not_configured',
    };
  }

  private toSummary(a: DoctorApplication): AdminApplicationSummary {
    return {
      id: a.id,
      status: a.status,
      statusLabel: STATUS_LABEL[a.status],
      applicantUserId: a.userId,
      fullName: a.fullName,
      registrationCouncil: a.registrationCouncil,
      registrationNumber: a.registrationNumber,
      specialization: a.specialization,
      submittedAt: a.submittedAt,
      reviewDeadlineAt: a.reviewDeadlineAt,
      reviewOverdue: isReviewOverdue(a.status, a.reviewDeadlineAt),
      resubmissionCount: a.resubmissionCount,
    };
  }

  private async toDetail(em: EntityManager, a: DoctorApplication): Promise<AdminApplicationDetail> {
    const [documents, events, applicant] = await Promise.all([
      em.getRepository(DoctorApplicationDocument).find({ where: { applicationId: a.id }, order: { createdAt: 'ASC' } }),
      em.getRepository(DoctorApplicationEvent).find({ where: { applicationId: a.id }, order: { createdAt: 'ASC' } }),
      em.getRepository(User).findOne({ where: { id: a.userId } }),
    ]);
    return {
      ...this.toSummary(a),
      applicantPhone: applicant?.phone ?? '',
      email: a.email,
      emailVerified: false,
      qualification: a.qualification,
      medicalCollege: a.medicalCollege,
      clinicName: a.clinicName,
      clinicAddress: a.clinicAddress,
      city: a.city,
      consultationMode: a.consultationMode,
      reviewerId: a.reviewerId ?? null,
      decidedAt: a.decidedAt ?? null,
      reviewerNotes: a.reviewerNotes ?? null,
      applicantMessage: a.applicantMessage ?? null,
      registryCheck: a.registryCheck ?? null,
      registrySource: a.registrySource ?? null,
      registryReference: a.registryReference ?? null,
      doctorId: a.doctorId ?? null,
      documents: documents.filter((d) => !d.purgedAt).map((d) => this.toDocumentView(d)),
      events: events.map((e) => ({
        id: e.id,
        action: e.action,
        actorUserId: e.actorUserId,
        actorRole: e.actorRole,
        fromStatus: e.fromStatus ?? null,
        toStatus: e.toStatus ?? null,
        note: e.note ?? null,
        applicantMessage: e.applicantMessage ?? null,
        createdAt: e.createdAt,
      })),
      verificationNote:
        'Uploaded documents are not proof of authenticity. A reviewer must check the registration against the ' +
        'official medical register before approving.',
    };
  }
}
