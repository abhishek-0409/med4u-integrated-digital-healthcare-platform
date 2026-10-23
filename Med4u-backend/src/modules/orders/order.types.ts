import { OrderStatus, PaymentStatus } from '../../database/entities/order.entity';
import {
  PrescriptionRejectionReason,
  PrescriptionReviewStatus,
} from '../../database/entities/prescription-upload.entity';
import { MedicineProduct } from '../medicines/medicine.types';
import { ClinicalPrescriptionStatus, PrescribedMedicine, PrescribedTest } from '../../database/entities/clinical-prescription.entity';

export interface OrderItemResponse {
  variantId: string;
  name: string;
  genericName: string;
  strength: string | null;
  form: string;
  packSize: string | null;
  requiresPrescription: boolean;
  quantity: number;
  /** INR, per pack, as recorded when the order was placed (immutable snapshot). */
  mrp: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderPrescriptionSummary {
  id: string;
  status: PrescriptionReviewStatus;
  /** Present only when rejected. */
  rejectionReason: PrescriptionRejectionReason | null;
  reviewerNote: string | null;
  reviewedAt: Date | null;
}

export interface OrderHistoryEntry {
  status: OrderStatus;
  at: Date;
  by: 'customer' | 'pharmacy' | 'system';
}

export interface OrderResponse {
  id: string;
  status: OrderStatus;
  /** INR, computed by the server from catalog prices. */
  total: number;
  /** Always UNPAID for now: no payment provider is integrated. */
  paymentStatus: PaymentStatus;
  /** Contains seeded demo products: nothing is charged and nothing will be delivered. */
  isDemo: boolean;
  delivery: {
    name: string | null;
    phone: string | null;
    address: string;
    city: string | null;
    pincode: string | null;
  };
  /** Kept for older clients: the full address as one string. */
  deliveryAddress: string;
  awaitingPrescriptionReview: boolean;
  requiresPrescription: boolean;
  clinicalPrescriptionId: string | null;
  prescription: OrderPrescriptionSummary | null;
  canCancel: boolean;
  cancellationReason: string | null;
  createdAt: Date;
  /** Status changes recorded by Med4U. This is not live carrier tracking. */
  history: OrderHistoryEntry[];
  items: OrderItemResponse[];
}

export interface StaffOrderResponse extends Omit<OrderResponse, 'history' | 'prescription'> {
  customer: { id: string; name: string; phone: string };
  prescription:
    | (OrderPrescriptionSummary & {
        reviewedBy: string | null;
        mimeType: string;
        sizeBytes: number;
      })
    | null;
  clinicalPrescription: {
    id: string;
    reference: string;
    status: ClinicalPrescriptionStatus;
    diagnosis: string | null;
    medicines: PrescribedMedicine[];
    recommendedTests: PrescribedTest[];
  } | null;
  history: Array<OrderHistoryEntry & { actorRole: string; note: string | null }>;
}

export type QuoteIssue = 'NOT_FOUND' | 'UNPRICED' | 'OUT_OF_STOCK' | 'INSUFFICIENT_STOCK';

export interface QuoteLine {
  variantId: string;
  requestedQuantity: number;
  /** Null when the product no longer exists. */
  product: MedicineProduct | null;
  issue: QuoteIssue | null;
  availableQuantity: number;
  /** INR, current server price per pack (0 when unavailable). */
  unitPrice: number;
  lineTotal: number;
}

export interface QuoteResponse {
  lines: QuoteLine[];
  /** INR, over orderable lines only. */
  total: number;
  requiresPrescription: boolean;
  /** True when every line is available at the requested quantity. */
  canCheckout: boolean;
}
