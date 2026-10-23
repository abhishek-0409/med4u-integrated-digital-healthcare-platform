import { z } from 'zod';
import { E164_REGEX, normalizePhone } from '../../../common/utils/phone.util';

/** Accepts common local formats and yields canonical E.164. */
export const PhoneSchema = z
  .string()
  .transform(normalizePhone)
  .pipe(z.string().regex(E164_REGEX, 'Enter a valid phone number (e.g. +919876543210 or a 10-digit Indian mobile)'));
