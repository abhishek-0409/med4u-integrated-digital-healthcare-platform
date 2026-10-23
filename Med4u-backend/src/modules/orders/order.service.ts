import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Not, Repository } from 'typeorm';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { OrderItem } from '../../database/entities/order-item.entity';
import { OrderEvent } from '../../database/entities/order-event.entity';
import { ClinicalPrescription, ClinicalPrescriptionStatus } from '../../database/entities/clinical-prescription.entity';
import {
  PrescriptionReviewStatus,
  PrescriptionUpload,
} from '../../database/entities/prescription-upload.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { PaginatedResponse } from '../../common/utils/pagination.util';
import { paiseToDecimal, paiseToRupees, toPaise } from '../../common/utils/money.util';
import { MedicineService } from '../medicines/medicine.service';
import { matchesPrescriptionProduct, maxPacksForPrescription } from '../medicines/prescription-matching';
import { MAX_ORDER_QUANTITY } from '../medicines/medicine.types';
import {
  CancelOrderDto,
  CreateOrderDto,
  ListOrdersQueryDto,
  QuoteDto,
  StaffListOrdersQueryDto,
  UpdateOrderStatusDto,
} from './dto/create-order.dto';
import { canTransition, checkStaffTransition, isCustomerCancellable } from './order-state';
import {
  OrderHistoryEntry,
  OrderItemResponse,
  OrderPrescriptionSummary,
  OrderResponse,
  QuoteLine,
  QuoteResponse,
  StaffOrderResponse,
} from './order.types';

const UNIQUE_VIOLATION = '23505';
const ACTIVE_PRESCRIPTION_INDEX = 'UQ_orders_active_prescription';
const ACTIVE_CLINICAL_PRESCRIPTION_INDEX = 'UQ_orders_active_clinical_prescription';

/** Who performed a status change; recorded in the order's audit trail. */
export interface OrderActor {
  id: string;
  role: UserRole;
}

@Injectable()
export class OrderService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly medicines: MedicineService,
  ) {}

  // ── Quote (read-only price/stock check for the cart) ──────────────────────

  /**
   * Prices and checks a cart against the live catalog without reserving anything. The client uses it
   * to show current prices, stock problems and the order total; checkout recomputes everything again.
   */
  async quote(dto: QuoteDto): Promise<QuoteResponse> {
    const quantities = this.mergeLines(dto.items);
    const found = await this.medicines.findForPurchase(this.dataSource.manager, [
      ...quantities.keys(),
    ]);

    let totalPaise = 0;
    let requiresPrescription = false;
    const lines: QuoteLine[] = [];
    for (const [variantId, requestedQuantity] of quantities) {
      const priced = found.get(variantId);
      if (!priced) {
        lines.push({
          variantId,
          requestedQuantity,
          product: null,
          issue: 'NOT_FOUND',
          availableQuantity: 0,
          unitPrice: 0,
          lineTotal: 0,
        });
        continue;
      }
      const { product } = priced;
      const priceUsable = product.price !== null && priced.sellingPaise <= priced.mrpPaise;
      const availableQuantity = Math.min(priced.stockQuantity, MAX_ORDER_QUANTITY);
      let issue: QuoteLine['issue'] = null;
      if (!priceUsable) issue = 'UNPRICED';
      else if (priced.stockQuantity === 0) issue = 'OUT_OF_STOCK';
      else if (requestedQuantity > availableQuantity) issue = 'INSUFFICIENT_STOCK';

      const lineTotal = issue ? 0 : priced.sellingPaise * requestedQuantity;
      totalPaise += lineTotal;
      requiresPrescription ||= product.requiresPrescription;
      lines.push({
        variantId,
        requestedQuantity,
        product,
        issue,
        availableQuantity,
        unitPrice: priceUsable ? paiseToRupees(priced.sellingPaise) : 0,
        lineTotal: paiseToRupees(lineTotal),
      });
    }
    return {
      lines,
      total: paiseToRupees(totalPaise),
      requiresPrescription,
      canCheckout: lines.every((l) => l.issue === null),
    };
  }

  // ── Checkout ──────────────────────────────────────────────────────────────

  /**
   * Places an order. Everything that matters is decided here from database state: prices come from the
   * catalog (client prices are not accepted), stock is checked and decremented under row locks, and
   * prescription-only items go to PENDING_REVIEW with the customer's own, unreviewed prescription attached.
   *
   * Lock order is always prescription -> order -> variants (variants sorted by id), the same as the
   * cancel and review paths, so concurrent requests cannot deadlock each other.
   */
  async create(userId: string, dto: CreateOrderDto): Promise<OrderResponse> {
    if (dto.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(userId, dto.idempotencyKey);
      if (existing) return this.toResponse(existing);
    }

    const quantities = this.mergeLines(dto.items);
    for (const [variantId, quantity] of quantities) {
      if (quantity > MAX_ORDER_QUANTITY) {
        throw new BadRequestException({
          code: 'QUANTITY_LIMIT_EXCEEDED',
          message: `You can order at most ${MAX_ORDER_QUANTITY} packs of one medicine at a time.`,
          details: { variantId },
        });
      }
    }
    const ids = [...quantities.keys()].sort();

    try {
      const orderId = await this.dataSource.transaction(async (em) => {
        let prescription: PrescriptionUpload | null = null;
        let clinicalPrescription: ClinicalPrescription | null = null;
        if (dto.prescriptionId) {
          prescription = await em.findOne(PrescriptionUpload, {
            where: { id: dto.prescriptionId, patientId: userId },
            lock: { mode: 'pessimistic_write' },
          });
        }
        if (dto.clinicalPrescriptionId) {
          clinicalPrescription = await em.findOne(ClinicalPrescription, {
            where: {
              id: dto.clinicalPrescriptionId,
              patientId: userId,
              status: ClinicalPrescriptionStatus.ISSUED,
            },
            lock: { mode: 'pessimistic_write' },
          });
          if (!clinicalPrescription || !clinicalPrescription.issuedAt) {
            throw new UnprocessableEntityException({
              code: 'PRESCRIPTION_NOT_USABLE',
              message: 'Only your current, issued doctor prescription can be used for an order.',
            });
          }
          const activeOrder = await em.findOne(Order, {
            where: { clinicalPrescriptionId: clinicalPrescription.id, status: Not(OrderStatus.CANCELLED) },
            lock: { mode: 'pessimistic_write' },
          });
          if (activeOrder) {
            throw new ConflictException({ code: 'PRESCRIPTION_ALREADY_USED', message: 'This prescription already has an active medicine order.' });
          }
        }

        await em.query(
          'SELECT id FROM variants WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL ORDER BY id FOR UPDATE',
          [ids],
        );

        const products = await this.medicines.findForPurchase(em, ids);

        let totalPaise = 0;
        let needsPrescription = false;
        let isDemo = false;
        const items: Partial<OrderItem>[] = [];

        for (const id of ids) {
          const quantity = quantities.get(id) as number;
          const priced = products.get(id);
          if (!priced) {
            throw new NotFoundException({
              code: 'MEDICINE_NOT_FOUND',
              message: 'One of the medicines in your cart is no longer available.',
              details: { variantId: id },
            });
          }
          const { product } = priced;
          if (clinicalPrescription) {
            const prescribed = (clinicalPrescription.medicines ?? []).filter((medicine) =>
              matchesPrescriptionProduct(medicine, product),
            );
            if (!prescribed.length) {
              throw new UnprocessableEntityException({
                code: 'MEDICINE_NOT_PRESCRIBED',
                message: 'This catalog item does not match a medicine on the issued prescription.',
                details: { variantId: id },
              });
            }
            const allowed = prescribed.some((medicine) => {
              const limit = maxPacksForPrescription(medicine, product.packSize);
              return !limit.unitKnown || quantity <= limit.quantity;
            });
            if (!allowed) {
              throw new UnprocessableEntityException({
                code: 'PRESCRIPTION_QUANTITY_EXCEEDED',
                message: 'The selected package quantity exceeds the quantity on the prescription.',
                details: { variantId: id },
              });
            }
          }
          if (!product.price || priced.sellingPaise > priced.mrpPaise) {
            throw new ConflictException({
              code: 'MEDICINE_UNAVAILABLE',
              message: `${product.name} cannot be ordered right now.`,
              details: { variantId: id },
            });
          }
          if (priced.stockQuantity < quantity) {
            throw new ConflictException({
              code: 'INSUFFICIENT_STOCK',
              message:
                priced.stockQuantity === 0
                  ? `${product.name} is out of stock.`
                  : `Only ${priced.stockQuantity} pack(s) of ${product.name} are in stock.`,
              details: { variantId: id, available: priced.stockQuantity },
            });
          }

          const lineTotal = priced.sellingPaise * quantity;
          totalPaise += lineTotal;
          needsPrescription ||= product.requiresPrescription;
          isDemo ||= product.isDemo;
          items.push({
            variantId: id,
            productName: product.name,
            genericName: product.genericName,
            strength: product.strength ?? undefined,
            form: product.form,
            packSize: product.packSize ?? undefined,
            requiresPrescription: product.requiresPrescription,
            quantity,
            mrp: paiseToDecimal(priced.mrpPaise),
            unitPrice: paiseToDecimal(priced.sellingPaise),
            lineTotal: paiseToDecimal(lineTotal),
          });
        }

        // The customer confirmed a specific amount: if prices moved since, make them look again.
        if (dto.expectedTotal !== undefined && toPaise(dto.expectedTotal) !== totalPaise) {
          throw new ConflictException({
            code: 'PRICE_CHANGED',
            message:
              'Prices changed since you last reviewed your cart. Please check the new total.',
            details: { expectedTotal: dto.expectedTotal, currentTotal: paiseToRupees(totalPaise) },
          });
        }

        if (needsPrescription && !clinicalPrescription) {
          await this.assertPrescriptionUsable(em, dto.prescriptionId, prescription);
        } else if (dto.prescriptionId && !needsPrescription) {
          throw new BadRequestException({
            code: 'PRESCRIPTION_NOT_REQUIRED',
            message: 'None of the medicines in this order need a prescription.',
          });
        }

        // Guarded decrement: the WHERE clause is the final word on stock, even under the row lock.
        for (const item of items) {
          const [, affected] = (await em.query(
            'UPDATE variants SET stock_quantity = stock_quantity - $1 WHERE id = $2 AND stock_quantity >= $1',
            [item.quantity, item.variantId],
          )) as [unknown, number];
          if (affected !== 1) {
            throw new ConflictException({
              code: 'INSUFFICIENT_STOCK',
              message: 'Stock changed while placing your order. Please review your cart.',
              details: { variantId: item.variantId },
            });
          }
        }

        const status = needsPrescription || clinicalPrescription ? OrderStatus.PENDING_REVIEW : OrderStatus.PLACED;
        const { delivery } = dto;
        const order = await em.save(
          Order,
          em.create(Order, {
            userId,
            status,
            total: paiseToDecimal(totalPaise),
            deliveryAddress: `${delivery.line1}, ${delivery.city} - ${delivery.pincode}`,
            deliveryName: delivery.name,
            deliveryPhone: delivery.phone,
            deliveryCity: delivery.city,
            deliveryPincode: delivery.pincode,
            prescriptionId: needsPrescription ? dto.prescriptionId : null,
            clinicalPrescriptionId: clinicalPrescription?.id ?? null,
            isDemo,
            idempotencyKey: dto.idempotencyKey,
            items: items.map((i) => em.create(OrderItem, i)),
          }),
        );
        await this.recordEvent(em, order.id, { id: userId, role: UserRole.PATIENT }, null, status);
        return order.id;
      });

      return this.toResponse(await this.requireOwned(userId, orderId));
    } catch (err) {
      const pg = err as { code?: string; constraint?: string };
      if (pg.code === UNIQUE_VIOLATION) {
        if (pg.constraint === ACTIVE_PRESCRIPTION_INDEX) {
          throw new ConflictException({
            code: 'PRESCRIPTION_ALREADY_USED',
            message:
              'This prescription is already attached to another order. Upload it again to reuse it.',
          });
        }
        if (pg.constraint === ACTIVE_CLINICAL_PRESCRIPTION_INDEX) {
          throw new ConflictException({
            code: 'PRESCRIPTION_ALREADY_USED',
            message: 'This prescription already has an active medicine order.',
          });
        }
        // Lost an idempotency race: the other request already created this order.
        if (dto.idempotencyKey) {
          const existing = await this.findByIdempotencyKey(userId, dto.idempotencyKey);
          if (existing) return this.toResponse(existing);
        }
      }
      throw err;
    }
  }

  // ── Customer reads and cancellation ───────────────────────────────────────

  async list(userId: string, query: ListOrdersQueryDto): Promise<PaginatedResponse<OrderResponse>> {
    const [orders, total] = await this.orders.findAndCount({
      where: { userId },
      relations: ['items', 'events', 'prescription', 'clinicalPrescription'],
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return new PaginatedResponse(
      orders.map((o) => this.toResponse(o)),
      total,
      query.page,
      query.limit,
    );
  }

  async getOne(userId: string, id: string): Promise<OrderResponse> {
    return this.toResponse(await this.requireOwned(userId, id));
  }

  /** Cancels the customer's own order while the pharmacy has not started packing it, and returns its stock. */
  async cancel(userId: string, id: string, dto: CancelOrderDto = {}): Promise<OrderResponse> {
    await this.dataSource.transaction(async (em) => {
      const order = await this.lockOrder(em, id, userId);
      if (!order) throw this.notFound();
      if (order.status === OrderStatus.CANCELLED) return; // idempotent: never restores stock twice
      if (!isCustomerCancellable(order.status)) {
        throw new ConflictException({
          code: 'ORDER_NOT_CANCELLABLE',
          message:
            order.status === OrderStatus.DELIVERED
              ? 'Delivered orders cannot be cancelled.'
              : 'This order is already being packed or shipped. Please contact the pharmacy.',
        });
      }
      await this.cancelLocked(
        em,
        order,
        { id: userId, role: UserRole.PATIENT },
        dto.reason ?? 'Cancelled by customer',
      );
    });
    return this.toResponse(await this.requireOwned(userId, id));
  }

  // ── Pharmacy staff ────────────────────────────────────────────────────────

  /** Oldest first, so the longest-waiting order is handled first. */
  async staffList(query: StaffListOrdersQueryDto): Promise<PaginatedResponse<StaffOrderResponse>> {
    const [orders, total] = await this.orders.findAndCount({
      where: query.status ? { status: query.status } : {},
      relations: ['items', 'events', 'prescription', 'clinicalPrescription', 'user'],
      order: { createdAt: 'ASC', id: 'ASC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return new PaginatedResponse(
      orders.map((o) => this.toStaffResponse(o)),
      total,
      query.page,
      query.limit,
    );
  }

  async staffGet(id: string): Promise<StaffOrderResponse> {
    return this.toStaffResponse(await this.requireAny(id));
  }

  /** Moves an order along the lifecycle. Every change is validated against the state machine. */
  async staffUpdateStatus(
    actor: OrderActor,
    id: string,
    dto: UpdateOrderStatusDto,
  ): Promise<StaffOrderResponse> {
    await this.dataSource.transaction(async (em) => {
      const order = await this.lockOrder(em, id);
      if (!order) throw this.notFound();

      if (dto.status === OrderStatus.CANCELLED) {
        if (!canTransition(order.status, OrderStatus.CANCELLED)) {
          throw this.invalidTransition(order.status, dto.status);
        }
        await this.cancelLocked(em, order, actor, dto.note ?? 'Cancelled by pharmacy');
        return;
      }

      const lines = await em.find(OrderItem, { where: { orderId: id } });
      const prescription = order.prescriptionId
        ? await em.findOne(PrescriptionUpload, { where: { id: order.prescriptionId } })
        : null;
      const clinicalPrescription = order.clinicalPrescriptionId
        ? await em.findOne(ClinicalPrescription, {
            where: { id: order.clinicalPrescriptionId, status: ClinicalPrescriptionStatus.ISSUED },
            lock: { mode: 'pessimistic_write' },
          })
        : null;
      if (order.clinicalPrescriptionId && order.status === OrderStatus.PENDING_REVIEW && !clinicalPrescription) {
        throw new UnprocessableEntityException({
          code: 'PRESCRIPTION_NOT_USABLE',
          message: 'The linked doctor prescription is no longer current. Cancel this order and contact the patient.',
        });
      }
      const verdict = checkStaffTransition({
        from: order.status,
        to: dto.status,
        requiresPrescription: lines.some((l) => l.requiresPrescription),
        prescriptionApproved:
          prescription?.status === PrescriptionReviewStatus.APPROVED || !!clinicalPrescription,
        viaPrescriptionApproval:
          order.status === OrderStatus.PENDING_REVIEW &&
          dto.status === OrderStatus.CONFIRMED &&
          !!clinicalPrescription,
      });
      if (!verdict.ok) {
        if (verdict.code === 'INVALID_TRANSITION')
          throw this.invalidTransition(order.status, dto.status);
        throw new UnprocessableEntityException({ code: verdict.code, message: verdict.message });
      }

      const from = order.status;
      order.status = dto.status;
      await em.save(order);
      await this.recordEvent(em, order.id, actor, from, dto.status, dto.note);
    });
    return this.toStaffResponse(await this.requireAny(id));
  }

  // ── Hooks used by the prescription review flow (caller owns the transaction) ─

  /** The live (non-cancelled) order a prescription is attached to, row-locked, or null. */
  findActiveOrderForPrescription(em: EntityManager, prescriptionId: string): Promise<Order | null> {
    return em.findOne(Order, {
      where: { prescriptionId, status: Not(OrderStatus.CANCELLED) },
      lock: { mode: 'pessimistic_write' },
    });
  }

  /** PENDING_REVIEW -> CONFIRMED, performed by the reviewer who just approved the prescription. */
  async confirmAfterApproval(em: EntityManager, order: Order, actor: OrderActor): Promise<void> {
    const verdict = checkStaffTransition({
      from: order.status,
      to: OrderStatus.CONFIRMED,
      requiresPrescription: true,
      prescriptionApproved: true,
      viaPrescriptionApproval: true,
    });
    if (!verdict.ok) throw this.invalidTransition(order.status, OrderStatus.CONFIRMED);
    const from = order.status;
    order.status = OrderStatus.CONFIRMED;
    await em.save(order);
    await this.recordEvent(
      em,
      order.id,
      actor,
      from,
      OrderStatus.CONFIRMED,
      'Prescription approved',
    );
  }

  /** Cancels an already-locked order and puts its stock back. Callers check permission and state first. */
  async cancelLocked(
    em: EntityManager,
    order: Order,
    actor: OrderActor,
    reason: string,
  ): Promise<void> {
    const items = await em.find(OrderItem, { where: { orderId: order.id } });
    for (const item of items.sort((a, b) => a.variantId.localeCompare(b.variantId))) {
      await em.query('UPDATE variants SET stock_quantity = stock_quantity + $1 WHERE id = $2', [
        item.quantity,
        item.variantId,
      ]);
    }
    const from = order.status;
    order.status = OrderStatus.CANCELLED;
    order.cancellationReason = reason.slice(0, 200);
    await em.save(order);
    await this.recordEvent(em, order.id, actor, from, OrderStatus.CANCELLED, reason);
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private mergeLines(lines: QuoteDto['items']): Map<string, number> {
    // Repeated lines are merged so stock and the per-line cap are checked against the real quantity.
    const quantities = new Map<string, number>();
    for (const line of lines) {
      quantities.set(line.variantId, (quantities.get(line.variantId) ?? 0) + line.quantity);
    }
    return quantities;
  }

  private async assertPrescriptionUsable(
    em: EntityManager,
    prescriptionId: string | undefined,
    prescription: PrescriptionUpload | null,
  ): Promise<void> {
    if (!prescriptionId) {
      throw new UnprocessableEntityException({
        code: 'PRESCRIPTION_REQUIRED',
        message:
          'This order contains prescription-only medicines. Upload your prescription to continue.',
      });
    }
    // Unknown and someone else's look identical, so ids cannot be probed.
    if (!prescription) {
      throw new UnprocessableEntityException({
        code: 'PRESCRIPTION_INVALID',
        message: 'We could not find that prescription. Please upload it again.',
      });
    }
    if (prescription.status !== PrescriptionReviewStatus.PENDING) {
      throw new UnprocessableEntityException({
        code: 'PRESCRIPTION_NOT_USABLE',
        message:
          prescription.status === PrescriptionReviewStatus.REJECTED
            ? 'That prescription was not accepted. Please upload a new one.'
            : 'That prescription has already been used. Please upload it again for this order.',
      });
    }
    const inUse = await em.count(Order, {
      where: { prescriptionId: prescription.id, status: Not(OrderStatus.CANCELLED) },
    });
    if (inUse > 0) {
      throw new ConflictException({
        code: 'PRESCRIPTION_ALREADY_USED',
        message: 'This prescription is already attached to another order.',
      });
    }
  }

  /**
   * Row-locks an order (optionally only if it belongs to `userId`). The attached prescription is locked
   * first so every path takes locks in the same order: prescription, order, variants.
   */
  private async lockOrder(em: EntityManager, id: string, userId?: string): Promise<Order | null> {
    const head = await em.findOne(Order, {
      where: userId ? { id, userId } : { id },
      select: { id: true, prescriptionId: true, clinicalPrescriptionId: true },
    });
    if (!head) return null;
    if (head.prescriptionId) {
      await em.query('SELECT id FROM prescription_uploads WHERE id = $1 FOR UPDATE', [
        head.prescriptionId,
      ]);
    }
    if (head.clinicalPrescriptionId) {
      await em.query('SELECT id FROM clinical_prescriptions WHERE id = $1 FOR UPDATE', [head.clinicalPrescriptionId]);
    }
    return em.findOne(Order, { where: { id }, lock: { mode: 'pessimistic_write' } });
  }

  private recordEvent(
    em: EntityManager,
    orderId: string,
    actor: OrderActor,
    from: OrderStatus | null,
    to: OrderStatus,
    note?: string | null,
  ): Promise<OrderEvent> {
    return em.save(
      em.create(OrderEvent, {
        orderId,
        actorId: actor.id,
        actorRole: actor.role,
        fromStatus: from,
        toStatus: to,
        note: note ? note.slice(0, 200) : null,
      }),
    );
  }

  private findByIdempotencyKey(userId: string, key: string): Promise<Order | null> {
    return this.orders.findOne({
      where: { userId, idempotencyKey: key },
      relations: ['items', 'events', 'prescription', 'clinicalPrescription'],
    });
  }

  private async requireOwned(userId: string, id: string): Promise<Order> {
    const order = await this.orders.findOne({
      where: { id, userId },
      relations: ['items', 'events', 'prescription', 'clinicalPrescription'],
    });
    if (!order) throw this.notFound();
    return order;
  }

  private async requireAny(id: string): Promise<Order> {
    const order = await this.orders.findOne({
      where: { id },
      relations: ['items', 'events', 'prescription', 'clinicalPrescription', 'user'],
    });
    if (!order) throw this.notFound();
    return order;
  }

  private notFound(): NotFoundException {
    return new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found.' });
  }

  private invalidTransition(from: OrderStatus, to: OrderStatus): ConflictException {
    return new ConflictException({
      code: 'INVALID_TRANSITION',
      message: `An order that is ${from} cannot be changed to ${to}.`,
      details: { from, to },
    });
  }

  private sortedItems(order: Order): OrderItemResponse[] {
    return [...(order.items ?? [])]
      .sort((a, b) => a.productName.localeCompare(b.productName))
      .map((i) => ({
        variantId: i.variantId,
        name: i.productName,
        genericName: i.genericName,
        strength: i.strength ?? null,
        form: i.form,
        packSize: i.packSize ?? null,
        requiresPrescription: i.requiresPrescription,
        quantity: i.quantity,
        mrp: paiseToRupees(toPaise(i.mrp)),
        unitPrice: paiseToRupees(toPaise(i.unitPrice)),
        lineTotal: paiseToRupees(toPaise(i.lineTotal)),
      }));
  }

  private sortedEvents(order: Order): OrderEvent[] {
    return [...(order.events ?? [])].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
    );
  }

  private prescriptionSummary(order: Order): OrderPrescriptionSummary | null {
    const p = order.prescription;
    if (!p) return null;
    return {
      id: p.id,
      status: p.status,
      rejectionReason: p.rejectionReason ?? null,
      reviewerNote: p.reviewerNote ?? null,
      reviewedAt: p.reviewedAt ?? null,
    };
  }

  private toResponse(order: Order): OrderResponse {
    const items = this.sortedItems(order);
    const history: OrderHistoryEntry[] = this.sortedEvents(order).map((e) => ({
      status: e.toStatus as OrderStatus,
      at: e.createdAt,
      by: e.actorRole === UserRole.PATIENT ? 'customer' : e.actorId ? 'pharmacy' : 'system',
    }));
    return {
      id: order.id,
      status: order.status,
      total: paiseToRupees(toPaise(order.total)),
      paymentStatus: order.paymentStatus,
      isDemo: order.isDemo,
      delivery: {
        name: order.deliveryName ?? null,
        phone: order.deliveryPhone ?? null,
        address: order.deliveryAddress,
        city: order.deliveryCity ?? null,
        pincode: order.deliveryPincode ?? null,
      },
      deliveryAddress: order.deliveryAddress,
      awaitingPrescriptionReview: order.status === OrderStatus.PENDING_REVIEW,
      requiresPrescription: items.some((i) => i.requiresPrescription),
      clinicalPrescriptionId: order.clinicalPrescriptionId ?? null,
      prescription: this.prescriptionSummary(order),
      canCancel: isCustomerCancellable(order.status),
      cancellationReason: order.cancellationReason ?? null,
      createdAt: order.createdAt,
      history,
      items,
    };
  }

  private toStaffResponse(order: Order): StaffOrderResponse {
    const base = this.toResponse(order);
    const user = order.user as User | undefined;
    const p = order.prescription;
    const summary = this.prescriptionSummary(order);
    return {
      ...base,
      customer: { id: order.userId, name: user?.name ?? '', phone: user?.phone ?? '' },
      prescription:
        summary && p
          ? {
              ...summary,
              reviewedBy: p.reviewedBy ?? null,
              mimeType: p.mimeType,
              sizeBytes: p.sizeBytes,
            }
          : null,
      clinicalPrescription: order.clinicalPrescription
        ? {
            id: order.clinicalPrescription.id,
            reference: `RX-${order.clinicalPrescription.id.replace(/-/g, '').slice(0, 8).toUpperCase()}-V${order.clinicalPrescription.version}`,
            status: order.clinicalPrescription.status,
            diagnosis: order.clinicalPrescription.diagnosis ?? null,
            medicines: order.clinicalPrescription.medicines ?? [],
            recommendedTests: order.clinicalPrescription.recommendedTests ?? [],
          }
        : null,
      history: this.sortedEvents(order).map((e) => ({
        status: e.toStatus as OrderStatus,
        at: e.createdAt,
        by: e.actorRole === UserRole.PATIENT ? 'customer' : e.actorId ? 'pharmacy' : 'system',
        actorRole: e.actorRole,
        note: e.note ?? null,
      })),
    };
  }
}
