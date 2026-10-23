import { z } from 'zod';
import { OrderStatus } from '../../../database/entities/order.entity';
import { STAFF_SETTABLE } from '../order-state';

export const MAX_QUANTITY_PER_LINE = 10;

const OrderLinesSchema = z
  .array(
    z
      .object({
        /** The purchasable product id (`variants.id`) from the medicine catalog. */
        variantId: z.string().uuid(),
        quantity: z.number().int().min(1).max(MAX_QUANTITY_PER_LINE),
      })
      .strict(),
  )
  .min(1)
  .max(30);

/** Indian mobile number, with or without +91 / spaces / dashes. Normalised to +91XXXXXXXXXX. */
const PhoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^(?:\+?91)?[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'))
  .transform((v) => `+91${v.slice(-10)}`);

export const DeliverySchema = z
  .object({
    name: z.string().trim().min(2, 'Enter the recipient name').max(100),
    phone: PhoneSchema,
    line1: z.string().trim().min(5, 'Enter house/flat, street and area').max(250),
    city: z.string().trim().min(2, 'Enter the city').max(80),
    pincode: z
      .string()
      .trim()
      .regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code'),
  })
  .strict();

export type DeliveryDto = z.infer<typeof DeliverySchema>;

export const CreateOrderSchema = z
  .object({
    items: OrderLinesSchema,
    delivery: DeliverySchema,
    /** An uploaded prescription (own, still pending). Required when any item needs one. */
    prescriptionId: z.string().uuid().optional(),
    /** An issued doctor-authored prescription belonging to this patient. Mutually exclusive with upload id. */
    clinicalPrescriptionId: z.string().uuid().optional(),
    /**
     * The total (INR) the customer was shown. Never used for pricing: if the server's total differs the
     * order is refused with PRICE_CHANGED so the customer can confirm the new amount.
     */
    expectedTotal: z.number().min(0).max(10_000_000).optional(),
    /** Client-generated token; a retried request with the same key returns the original order. */
    idempotencyKey: z
      .string()
      .min(8)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.prescriptionId && value.clinicalPrescriptionId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['clinicalPrescriptionId'], message: 'Choose one prescription record.' });
    }
  });

export type CreateOrderDto = z.infer<typeof CreateOrderSchema>;

export const QuoteSchema = z.object({ items: OrderLinesSchema }).strict();
export type QuoteDto = z.infer<typeof QuoteSchema>;

export const ListOrdersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict();

export type ListOrdersQueryDto = z.infer<typeof ListOrdersQuerySchema>;

export const CancelOrderSchema = z
  .object({ reason: z.string().trim().min(1).max(200).optional() })
  .strict();
export type CancelOrderDto = z.infer<typeof CancelOrderSchema>;

// ── Staff ────────────────────────────────────────────────────────────────

export const StaffListOrdersQuerySchema = z
  .object({
    status: z.nativeEnum(OrderStatus).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export type StaffListOrdersQueryDto = z.infer<typeof StaffListOrdersQuerySchema>;

export const UpdateOrderStatusSchema = z
  .object({
    status: z.nativeEnum(OrderStatus).refine((s) => STAFF_SETTABLE.includes(s), {
      message: 'That status cannot be set directly',
    }),
    note: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export type UpdateOrderStatusDto = z.infer<typeof UpdateOrderStatusSchema>;
