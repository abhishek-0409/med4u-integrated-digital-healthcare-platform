import { PrescriptionRejectionReason, PrescriptionReviewStatus } from "./order";

/** A prescription the patient uploaded. The file itself is never exposed to the app. */
export interface Prescription {
  id: string;
  status: PrescriptionReviewStatus;
  mimeType: string;
  sizeBytes: number;
  rejectionReason: PrescriptionRejectionReason | null;
  reviewerNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  /** The live order this prescription is attached to, if any. */
  orderId: string | null;
}

/** A file chosen on the device, ready to upload. */
export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
}
