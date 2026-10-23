import { z } from 'zod';
import { PhoneSchema } from './phone.schema';

export const SendOtpSchema = z.object({
  phone: PhoneSchema,
});

export type SendOtpDto = z.infer<typeof SendOtpSchema>;
