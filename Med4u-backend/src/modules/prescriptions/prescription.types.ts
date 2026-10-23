import { OrderStatus } from '../../database/entities/order.entity';
import {
  PrescriptionRejectionReason,
  PrescriptionReviewStatus,
} from '../../database/entities/prescription-upload.entity';

/** What a patient sees about their own upload. No storage key, hash or reviewer identity. */
export interface PrescriptionResponse {
  id: string;
  status: PrescriptionReviewStatus;
  mimeType: string;
  sizeBytes: number;
  rejectionReason: PrescriptionRejectionReason | null;
  reviewerNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  /** The live order this prescription is attached to, if any. */
  orderId: string | null;
}

export interface ReviewQueueItem {
  id: string;
  status: PrescriptionReviewStatus;
  mimeType: string;
  sizeBytes: number;
  submittedAt: Date;
  patientName: string;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  rejectionReason: PrescriptionRejectionReason | null;
  reviewerNote: string | null;
  /** The order awaiting this prescription, with the medicines to check it against. */
  order: {
    id: string;
    status: OrderStatus;
    placedAt: Date;
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

export interface PrescriptionFile {
  data: Buffer;
  mimeType: string;
}
