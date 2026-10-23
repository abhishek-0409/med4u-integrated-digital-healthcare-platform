import { z } from 'zod';
import { PhoneSchema } from './phone.schema';

export const VerifyOtpSchema = z.object({
  phone: PhoneSchema,
  otp: z
    .string()
    .length(6, 'OTP must be exactly 6 digits')
    .regex(/^\d{6}$/, 'OTP must contain only digits'),
});

export type VerifyOtpDto = z.infer<typeof VerifyOtpSchema>;
