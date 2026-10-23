import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, In, MoreThan, Not, Repository } from 'typeorm';
import { PaginatedResponse } from '../../common/utils/pagination.util';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import {
  PrescriptionRejectionReason,
  PrescriptionReviewStatus,
  PrescriptionUpload,
} from '../../database/entities/prescription-upload.entity';
import { UserRole } from '../../database/entities/user.entity';
import { OrderActor, OrderService } from '../orders/order.service';
import { sniffPrescriptionMime } from './file-type.util';
import { PrescriptionStorageService } from './prescription-storage.service';
import {
  ListMyPrescriptionsQueryDto,
  RejectPrescriptionDto,
  ReviewQueueQueryDto,
} from './dto/prescription.dto';
import { PrescriptionFile, PrescriptionResponse, ReviewQueueItem } from './prescription.types';

export const MAX_PRESCRIPTION_BYTES = 5 * 1024 * 1024;
/** Upload throttle per patient, so the store cannot be filled with junk. */
const MAX_UPLOADS_PER_DAY = 10;

const REJECTION_TEXT: Record<PrescriptionRejectionReason, string> = {
  [PrescriptionRejectionReason.ILLEGIBLE]: 'the prescription was not legible',
  [PrescriptionRejectionReason.EXPIRED]: 'the prescription has expired',
  [PrescriptionRejectionReason.INCOMPLETE]: 'the prescription was incomplete',
  [PrescriptionRejectionReason.MEDICINE_NOT_COVERED]: 'it does not cover the medicines ordered',
  [PrescriptionRejectionReason.NOT_A_PRESCRIPTION]: 'the document was not a prescription',
  [PrescriptionRejectionReason.OTHER]: 'it could not be accepted',
};

@Injectable()
export class PrescriptionService {
  private readonly logger = new Logger(PrescriptionService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(PrescriptionUpload) private readonly uploads: Repository<PrescriptionUpload>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly storage: PrescriptionStorageService,
    private readonly orderService: OrderService,
  ) {}

  // ── Patient ───────────────────────────────────────────────────────────────

  /** Stores a prescription for the patient. It stays PENDING until a pharmacist reviews it with an order. */
  async upload(
    patientId: string,
    file: { buffer: Buffer; size: number } | undefined,
  ): Promise<PrescriptionResponse> {
    if (!file || file.size === 0) {
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'Choose a prescription file to upload.',
      });
    }
    if (file.size > MAX_PRESCRIPTION_BYTES) {
      throw new PayloadTooLargeException({
        code: 'FILE_TOO_LARGE',
        message: 'The file must be 5 MB or smaller.',
      });
    }
    const mimeType = sniffPrescriptionMime(file.buffer);
    if (!mimeType) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_FILE_TYPE',
        message: 'Upload a JPEG, PNG or WebP photo, or a PDF.',
      });
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await this.uploads.count({ where: { patientId, createdAt: MoreThan(since) } });
    if (recent >= MAX_UPLOADS_PER_DAY) {
      throw new HttpException(
        {
          code: 'UPLOAD_LIMIT_REACHED',
          message: 'Too many uploads today. Please try again tomorrow.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const storageKey = await this.storage.save(file.buffer);
    try {
      const saved = await this.uploads.save(
        this.uploads.create({
          patientId,
          storageKey,
          mimeType,
          sizeBytes: file.buffer.length,
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
        }),
      );
      return this.toResponse(saved, null);
    } catch (err) {
      await this.storage.remove(storageKey).catch(() => undefined);
      throw err;
    }
  }

  async listMine(
    patientId: string,
    query: ListMyPrescriptionsQueryDto,
  ): Promise<PaginatedResponse<PrescriptionResponse>> {
    const [rows, total] = await this.uploads.findAndCount({
      where: { patientId },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    const live = await this.liveOrderIds(rows.map((r) => r.id));
    return new PaginatedResponse(
      rows.map((r) => this.toResponse(r, live.get(r.id) ?? null)),
      total,
      query.page,
      query.limit,
    );
  }

  async getMine(patientId: string, id: string): Promise<PrescriptionResponse> {
    const row = await this.uploads.findOne({ where: { id, patientId } });
    if (!row) throw this.notFound();
    const live = await this.liveOrderIds([id]);
    return this.toResponse(row, live.get(id) ?? null);
  }

  /**
   * Decrypts a prescription for its owner or for pharmacy staff. Everyone else gets a 404, the same
   * answer as for an id that does not exist.
   */
  async getFile(actor: OrderActor, id: string): Promise<PrescriptionFile> {
    const isStaff = actor.role === UserRole.PHARMACIST || actor.role === UserRole.ADMIN;
    const row = await this.uploads.findOne({
      where: isStaff ? { id } : { id, patientId: actor.id },
    });
    if (!row || (!isStaff && actor.role !== UserRole.PATIENT)) throw this.notFound();
    // Audit trail for every read of a medical document.
    this.logger.log(`prescription ${row.id} read by ${actor.role} ${actor.id}`);
    return { data: await this.storage.read(row.storageKey), mimeType: row.mimeType };
  }

  // ── Pharmacist review ─────────────────────────────────────────────────────

  /**
   * PENDING shows only prescriptions attached to a live order (oldest first): those are the ones
   * someone is waiting on. APPROVED / REJECTED show the review history, newest first.
   */
  async reviewQueue(query: ReviewQueueQueryDto): Promise<PaginatedResponse<ReviewQueueItem>> {
    const pending = query.status === PrescriptionReviewStatus.PENDING;
    const qb = this.uploads
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.patient', 'u')
      .where('p.status = :status', { status: query.status });
    if (pending) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM orders o WHERE o.prescription_id = p.id AND o.status <> 'CANCELLED' AND o.deleted_at IS NULL)`,
      );
    }
    qb.orderBy('p.createdAt', pending ? 'ASC' : 'DESC')
      .addOrderBy('p.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    const [rows, total] = await qb.getManyAndCount();

    const orders = rows.length
      ? await this.orders.find({
          where: { prescriptionId: In(rows.map((r) => r.id)) },
          relations: ['items'],
          order: { createdAt: 'DESC' },
        })
      : [];
    // Prefer the live order; fall back to the most recent one (e.g. the order a rejection cancelled).
    const byPrescription = new Map<string, Order>();
    for (const o of orders) {
      const current = byPrescription.get(o.prescriptionId as string);
      if (
        !current ||
        (current.status === OrderStatus.CANCELLED && o.status !== OrderStatus.CANCELLED)
      ) {
        byPrescription.set(o.prescriptionId as string, o);
      }
    }

    const items = rows.map((r) => this.toQueueItem(r, byPrescription.get(r.id)));
    return new PaginatedResponse(items, total, query.page, query.limit);
  }

  /** Approves the prescription and releases its order (PENDING_REVIEW -> CONFIRMED) in one transaction. */
  async approve(actor: OrderActor, id: string): Promise<ReviewQueueItem> {
    await this.dataSource.transaction(async (em) => {
      const rx = await this.lockReviewable(em.getRepository(PrescriptionUpload), actor, id);
      const order = await this.orderService.findActiveOrderForPrescription(em, id);
      if (!order || order.status !== OrderStatus.PENDING_REVIEW) throw this.noOrderToReview();

      rx.status = PrescriptionReviewStatus.APPROVED;
      rx.reviewedBy = actor.id;
      rx.reviewedAt = new Date();
      await em.save(rx);
      await this.orderService.confirmAfterApproval(em, order, actor);
    });
    return this.queueItem(id);
  }

  /** Rejects the prescription, cancels its order and returns the stock, in one transaction. */
  async reject(
    actor: OrderActor,
    id: string,
    dto: RejectPrescriptionDto,
  ): Promise<ReviewQueueItem> {
    await this.dataSource.transaction(async (em) => {
      const rx = await this.lockReviewable(em.getRepository(PrescriptionUpload), actor, id);
      const order = await this.orderService.findActiveOrderForPrescription(em, id);
      if (!order || order.status !== OrderStatus.PENDING_REVIEW) throw this.noOrderToReview();

      rx.status = PrescriptionReviewStatus.REJECTED;
      rx.reviewedBy = actor.id;
      rx.reviewedAt = new Date();
      rx.rejectionReason = dto.reason;
      rx.reviewerNote = dto.note ?? null;
      await em.save(rx);
      await this.orderService.cancelLocked(
        em,
        order,
        actor,
        `Prescription not accepted: ${REJECTION_TEXT[dto.reason]}.`,
      );
    });
    return this.queueItem(id);
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private async lockReviewable(
    repo: Repository<PrescriptionUpload>,
    actor: OrderActor,
    id: string,
  ): Promise<PrescriptionUpload> {
    const rx = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!rx) throw this.notFound();
    if (rx.patientId === actor.id) {
      throw new ForbiddenException({
        code: 'CANNOT_REVIEW_OWN_PRESCRIPTION',
        message: 'You cannot review your own prescription.',
      });
    }
    if (rx.status !== PrescriptionReviewStatus.PENDING) {
      throw new ConflictException({
        code: 'PRESCRIPTION_ALREADY_REVIEWED',
        message: 'This prescription has already been reviewed.',
      });
    }
    return rx;
  }

  private noOrderToReview(): ConflictException {
    return new ConflictException({
      code: 'NO_ORDER_AWAITING_REVIEW',
      message: 'No order is currently waiting on this prescription.',
    });
  }

  /** One prescription with the order (and medicines) it is being reviewed against. */
  getForReview(id: string): Promise<ReviewQueueItem> {
    return this.queueItem(id);
  }

  private async queueItem(id: string): Promise<ReviewQueueItem> {
    const row = await this.uploads
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.patient', 'u')
      .where('p.id = :id', { id })
      .getOne();
    if (!row) throw this.notFound();
    const order = await this.orders.findOne({
      where: { prescriptionId: id },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
    return this.toQueueItem(row, order ?? undefined);
  }

  private toQueueItem(r: PrescriptionUpload, order: Order | undefined): ReviewQueueItem {
    return {
      id: r.id,
      status: r.status,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      submittedAt: r.createdAt,
      patientName: r.patient.name,
      reviewedBy: r.reviewedBy ?? null,
      reviewedAt: r.reviewedAt ?? null,
      rejectionReason: r.rejectionReason ?? null,
      reviewerNote: r.reviewerNote ?? null,
      order: order
        ? {
            id: order.id,
            status: order.status,
            placedAt: order.createdAt,
            items: [...order.items]
              .sort((x, y) => x.productName.localeCompare(y.productName))
              .map((i) => ({
                name: i.productName,
                genericName: i.genericName,
                strength: i.strength ?? null,
                form: i.form,
                quantity: i.quantity,
                requiresPrescription: i.requiresPrescription,
              })),
          }
        : null,
    };
  }

  private async liveOrderIds(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const live = await this.orders.find({
      where: { prescriptionId: In(ids), status: Not(OrderStatus.CANCELLED) },
      select: { id: true, prescriptionId: true },
    });
    return new Map(live.map((o) => [o.prescriptionId as string, o.id]));
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'PRESCRIPTION_NOT_FOUND',
      message: 'Prescription not found.',
    });
  }

  private toResponse(row: PrescriptionUpload, orderId: string | null): PrescriptionResponse {
    return {
      id: row.id,
      status: row.status,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      rejectionReason: row.rejectionReason ?? null,
      reviewerNote: row.reviewerNote ?? null,
      reviewedAt: row.reviewedAt ?? null,
      createdAt: row.createdAt,
      orderId,
    };
  }
}
