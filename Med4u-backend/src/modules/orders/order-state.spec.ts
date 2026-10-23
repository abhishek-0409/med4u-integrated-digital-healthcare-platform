import { OrderStatus } from '../../database/entities/order.entity';
import {
  canTransition,
  checkStaffTransition,
  isCustomerCancellable,
  ORDER_TRANSITIONS,
  STAFF_SETTABLE,
} from './order-state';

const S = OrderStatus;

describe('order state machine', () => {
  it('allows only the documented forward path', () => {
    expect(canTransition(S.PLACED, S.CONFIRMED)).toBe(true);
    expect(canTransition(S.CONFIRMED, S.PROCESSING)).toBe(true);
    expect(canTransition(S.PROCESSING, S.SHIPPED)).toBe(true);
    expect(canTransition(S.SHIPPED, S.DELIVERED)).toBe(true);
  });

  it('rejects skipping, reversing and leaving terminal states', () => {
    expect(canTransition(S.PLACED, S.SHIPPED)).toBe(false);
    expect(canTransition(S.PLACED, S.DELIVERED)).toBe(false);
    expect(canTransition(S.SHIPPED, S.PROCESSING)).toBe(false);
    expect(canTransition(S.DELIVERED, S.CANCELLED)).toBe(false);
    expect(canTransition(S.CANCELLED, S.PLACED)).toBe(false);
    expect(canTransition(S.CANCELLED, S.CONFIRMED)).toBe(false);
    expect(ORDER_TRANSITIONS[S.DELIVERED]).toEqual([]);
    expect(ORDER_TRANSITIONS[S.CANCELLED]).toEqual([]);
  });

  it('never lets an order be moved back into an initial state', () => {
    for (const from of Object.values(S)) {
      expect(canTransition(from, S.PLACED)).toBe(false);
      expect(canTransition(from, S.PENDING_REVIEW)).toBe(false);
    }
    expect(STAFF_SETTABLE).not.toContain(S.PLACED);
    expect(STAFF_SETTABLE).not.toContain(S.PENDING_REVIEW);
  });

  it('lets customers cancel only before packing starts', () => {
    expect(isCustomerCancellable(S.PLACED)).toBe(true);
    expect(isCustomerCancellable(S.PENDING_REVIEW)).toBe(true);
    expect(isCustomerCancellable(S.CONFIRMED)).toBe(true);
    expect(isCustomerCancellable(S.PROCESSING)).toBe(false);
    expect(isCustomerCancellable(S.SHIPPED)).toBe(false);
    expect(isCustomerCancellable(S.DELIVERED)).toBe(false);
    expect(isCustomerCancellable(S.CANCELLED)).toBe(false);
  });

  describe('prescription gate', () => {
    const rx = { requiresPrescription: true };

    it('blocks a prescription-only order from advancing without approval', () => {
      for (const to of [S.CONFIRMED, S.PROCESSING, S.SHIPPED, S.DELIVERED]) {
        const verdict = checkStaffTransition({
          from: S.PENDING_REVIEW,
          to,
          ...rx,
          prescriptionApproved: false,
        });
        expect(verdict.ok).toBe(false);
      }
    });

    it('keeps PENDING_REVIEW -> CONFIRMED exclusive to the approval flow, even with an approved prescription', () => {
      const direct = checkStaffTransition({
        from: S.PENDING_REVIEW,
        to: S.CONFIRMED,
        ...rx,
        prescriptionApproved: true,
      });
      expect(direct).toMatchObject({ ok: false, code: 'PRESCRIPTION_APPROVAL_REQUIRED' });

      const viaApproval = checkStaffTransition({
        from: S.PENDING_REVIEW,
        to: S.CONFIRMED,
        ...rx,
        prescriptionApproved: true,
        viaPrescriptionApproval: true,
      });
      expect(viaApproval.ok).toBe(true);
    });

    it('blocks a later step when an order somehow lacks an approved prescription', () => {
      const verdict = checkStaffTransition({
        from: S.CONFIRMED,
        to: S.PROCESSING,
        ...rx,
        prescriptionApproved: false,
      });
      expect(verdict).toMatchObject({ ok: false, code: 'PRESCRIPTION_APPROVAL_REQUIRED' });
    });

    it('does not gate ordinary orders or cancellation', () => {
      expect(
        checkStaffTransition({
          from: S.PLACED,
          to: S.CONFIRMED,
          requiresPrescription: false,
          prescriptionApproved: false,
        }).ok,
      ).toBe(true);
      expect(
        checkStaffTransition({
          from: S.PENDING_REVIEW,
          to: S.CANCELLED,
          ...rx,
          prescriptionApproved: false,
        }).ok,
      ).toBe(true);
    });

    it('reports illegal jumps as INVALID_TRANSITION', () => {
      expect(
        checkStaffTransition({
          from: S.PLACED,
          to: S.DELIVERED,
          requiresPrescription: false,
          prescriptionApproved: false,
        }),
      ).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' });
    });
  });
});
