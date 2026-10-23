import { z } from 'zod';

export const CreateLabBookingSchema = z
  .object({
    testId: z.string().uuid(),
    preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    preferredTime: z.string().regex(/^(0[8-9]|1[0-8]):(00|30)$/),
    homeCollection: z.boolean(),
    address: z
      .object({
        line1: z.string().trim().min(3).max(120),
        line2: z.string().trim().max(120).optional(),
        city: z.string().trim().min(2).max(80),
        state: z.string().trim().min(2).max(80),
        pincode: z.string().regex(/^\d{6}$/),
      })
      .optional(),
    contactName: z.string().trim().min(2).max(100),
    contactPhone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 -]{8,20}$/),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.homeCollection && !value.address)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['address'],
        message: 'Address is required for home collection.',
      });
    if (!value.homeCollection && value.address)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['address'],
        message: 'Address is only accepted for home collection.',
      });
  });
export type CreateLabBookingDto = z.infer<typeof CreateLabBookingSchema>;
