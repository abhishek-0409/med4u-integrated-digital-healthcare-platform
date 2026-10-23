import { OrderStatus } from '../../database/entities/order.entity';

/**
 * Every legal order status change. Anything not listed here is rejected by the service.
 *
 *  PLACED ─► CONFIRMED ─► PROCESSING ─► SHIPPED ─► DELIVERED
 *  PENDING_REVIEW ─► CONFIRMED   (only through prescription approval, never the generic status endpoint)
 *  PLACED / PENDING_REVIEW / CONFIRMED / PROCESSING ─► CANCELLED
 *
 * Orders are created as PLACED or PENDING_REVIEW and are never moved back into those states.
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  [OrderStatus.PLACED]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.PENDING_REVIEW]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

/** Statuses a customer may cancel from. Once the pharmacy is packing, only staff can cancel. */
export const CUSTOMER_CANCELLABLE: readonly OrderStatus[] = [
  OrderStatus.PLACED,
  OrderStatus.PENDING_REVIEW,
  OrderStatus.CONFIRMED,
];

/** Targets the staff status endpoint accepts. PLACED/PENDING_REVIEW are only ever initial states. */
export const STAFF_SETTABLE: readonly OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function isCustomerCancellable(status: OrderStatus): boolean {
  return CUSTOMER_CANCELLABLE.includes(status);
}

export type TransitionVerdict =
  | { ok: true }
  | { ok: false; code: 'INVALID_TRANSITION' | 'PRESCRIPTION_APPROVAL_REQUIRED'; message: string };

/**
 * Pure rule check used for staff-driven changes. `viaPrescriptionApproval` is true only when an
 * authorized pharmacist confirms a reviewed clinical prescription order or the upload review flow
 * releases its order.
 */
export function checkStaffTransition(input: {
  from: OrderStatus;
  to: OrderStatus;
  requiresPrescription: boolean;
  prescriptionApproved: boolean;
  viaPrescriptionApproval?: boolean;
}): TransitionVerdict {
  const { from, to, requiresPrescription, prescriptionApproved, viaPrescriptionApproval } = input;

  if (!STAFF_SETTABLE.includes(to) || !canTransition(from, to)) {
    return {
      ok: false,
      code: 'INVALID_TRANSITION',
      message: `An order that is ${from} cannot be changed to ${to}.`,
    };
  }
  if (to === OrderStatus.CANCELLED) return { ok: true };

  // Prescription-only orders can never move forward without an approved prescription, and the
  // PENDING_REVIEW exit belongs to the review flow so that reviewer identity is always recorded.
  if (requiresPrescription) {
    if (!prescriptionApproved) {
      return {
        ok: false,
        code: 'PRESCRIPTION_APPROVAL_REQUIRED',
        message:
          'This order contains prescription-only medicines and needs an approved prescription.',
      };
    }
    if (from === OrderStatus.PENDING_REVIEW && !viaPrescriptionApproval) {
      return {
        ok: false,
        code: 'PRESCRIPTION_APPROVAL_REQUIRED',
        message: 'Approve the prescription to release this order.',
      };
    }
  }
  return { ok: true };
}
