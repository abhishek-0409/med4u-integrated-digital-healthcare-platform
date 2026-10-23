import { Order, OrderHistoryEntry, OrderPrescription, OrderStatus, PrescriptionRejectionReason, PrescriptionReviewStatus } from "./order";

export interface ReviewQueueItem {
  id: string;
  status: PrescriptionReviewStatus;
  mimeType: string;
  sizeBytes: number;
  submittedAt: string;
  patientName: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: PrescriptionRejectionReason | null;
  reviewerNote: string | null;
  order: {
    id: string;
    status: OrderStatus;
    placedAt: string;
    items: Array<{
      name: string;
      genericName: string;
      strength: string | null;
      form: string;
      quantity: number;
      requiresPrescription: boolean;
    }>;
  } | null;
}

export interface StaffOrder extends Omit<Order, "history" | "prescription"> {
  customer: { id: string; name: string; phone: string };
  prescription: (OrderPrescription & { reviewedBy: string | null; mimeType: string; sizeBytes: number }) | null;
  clinicalPrescription: {
    id: string;
    reference: string;
    status: "issued" | "superseded" | "cancelled";
    diagnosis: string | null;
    medicines: import("./clinical-prescription").ClinicalMedicine[];
    recommendedTests: import("./clinical-prescription").ClinicalRecommendedTest[];
  } | null;
  history: Array<OrderHistoryEntry & { actorRole: string; note: string | null }>;
}
