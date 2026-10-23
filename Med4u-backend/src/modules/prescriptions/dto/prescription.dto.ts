import { z } from 'zod';
import {
  PrescriptionRejectionReason,
  PrescriptionReviewStatus,
} from '../../../database/entities/prescription-upload.entity';

export const ListMyPrescriptionsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict();
export type ListMyPrescriptionsQueryDto = z.infer<typeof ListMyPrescriptionsQuerySchema>;

export const ReviewQueueQuerySchema = z
  .object({
    status: z.nativeEnum(PrescriptionReviewStatus).default(PrescriptionReviewStatus.PENDING),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export type ReviewQueueQueryDto = z.infer<typeof ReviewQueueQuerySchema>;

export const RejectPrescriptionSchema = z
  .object({
    reason: z.nativeEnum(PrescriptionRejectionReason),
    /** Shown to the patient. Keep it short and free of personal or medical details. */
    note: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export type RejectPrescriptionDto = z.infer<typeof RejectPrescriptionSchema>;
