export type OrderStatus =
  | "PLACED"
  | "PENDING_REVIEW"
  | "CONFIRMED"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED";

/** No payment provider is integrated yet, so orders are always unpaid. */
export type PaymentStatus = "UNPAID";

export type PrescriptionReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

export type PrescriptionRejectionReason =
  | "ILLEGIBLE"
  | "EXPIRED"
  | "INCOMPLETE"
  | "MEDICINE_NOT_COVERED"
  | "NOT_A_PRESCRIPTION"
  | "OTHER";

export interface OrderItem {
  variantId: string;
  name: string;
  genericName: string;
  strength: string | null;
  form: string;
  packSize: string | null;
  requiresPrescription: boolean;
  quantity: number;
  /** Price snapshot taken when the order was placed. */
  mrp: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderPrescription {
  id: string;
  status: PrescriptionReviewStatus;
  rejectionReason: PrescriptionRejectionReason | null;
  reviewerNote: string | null;
  reviewedAt: string | null;
}

export interface OrderHistoryEntry {
  status: OrderStatus;
  at: string;
  by: "customer" | "pharmacy" | "system";
}

/** Mirrors the backend OrderResponse. Amounts are INR computed by the server. */
export interface Order {
  id: string;
  status: OrderStatus;
  total: number;
  paymentStatus: PaymentStatus;
  /** Contains demo products: nothing is charged and nothing will be delivered. */
  isDemo: boolean;
  delivery: {
    name: string | null;
    phone: string | null;
    address: string;
    city: string | null;
    pincode: string | null;
  };
  deliveryAddress: string;
  awaitingPrescriptionReview: boolean;
  clinicalPrescriptionId?: string | null;
  requiresPrescription: boolean;
  prescription: OrderPrescription | null;
  canCancel: boolean;
  cancellationReason: string | null;
  createdAt: string;
  /** Status changes recorded by Med4U (not live carrier tracking). */
  history: OrderHistoryEntry[];
  items: OrderItem[];
}

export interface DeliveryDetails {
  name: string;
  phone: string;
  line1: string;
  city: string;
  pincode: string;
}

/** Only ids and quantities are sent: the server decides prices. */
export interface CreateOrderRequest {
  items: Array<{ variantId: string; quantity: number }>;
  delivery: DeliveryDetails;
  prescriptionId?: string;
  clinicalPrescriptionId?: string;
  /** The total the customer was shown. A mismatch makes the server refuse with PRICE_CHANGED. */
  expectedTotal?: number;
  idempotencyKey?: string;
}

export type QuoteIssue = "NOT_FOUND" | "UNPRICED" | "OUT_OF_STOCK" | "INSUFFICIENT_STOCK";

export interface QuoteLine {
  variantId: string;
  requestedQuantity: number;
  product: import("./medicine").MedicineProduct | null;
  issue: QuoteIssue | null;
  availableQuantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Quote {
  lines: QuoteLine[];
  /** INR, over orderable lines only. */
  total: number;
  requiresPrescription: boolean;
  canCheckout: boolean;
}
