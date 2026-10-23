import { z } from 'zod';
import { AppointmentType } from '../../../database/entities/appointment.entity';

export const CreatePaymentOrderSchema = z.object({
  doctorId: z.string().uuid(),
  slotId: z.string().uuid(),
  type: z.nativeEnum(AppointmentType).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type CreatePaymentOrderDto = z.infer<typeof CreatePaymentOrderSchema>;

export const VerifyAppointmentPaymentSchema = z.object({
  razorpayOrderId: z.string().min(1).max(64),
  razorpayPaymentId: z.string().min(1).max(64),
  razorpaySignature: z.string().regex(/^[a-f0-9]{64}$/i),
});

export type VerifyAppointmentPaymentDto = z.infer<typeof VerifyAppointmentPaymentSchema>;
