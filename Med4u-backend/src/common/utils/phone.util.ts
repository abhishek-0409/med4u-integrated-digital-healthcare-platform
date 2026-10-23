/**
 * Normalises user-typed phone numbers to E.164 without guessing beyond the documented Indian default:
 *  - "+<digits>" and "00<digits>" keep their own country code;
 *  - a bare 10-digit number, or a 0-prefixed 11-digit number, is treated as an Indian national number (+91);
 *  - a 12-digit number starting with 91 gets the missing "+".
 * Anything else is returned unchanged (minus separators) so the E.164 check rejects it.
 */
export function normalizePhone(raw: string): string {
  const compact = raw.trim().replace(/[\s().-]/g, '');
  if (compact.startsWith('+')) return `+${compact.slice(1).replace(/\D/g, '')}`;
  if (!/^\d+$/.test(compact)) return compact;
  if (compact.startsWith('00')) return `+${compact.slice(2)}`;
  if (compact.length === 10) return `+91${compact}`;
  if (compact.length === 11 && compact.startsWith('0')) return `+91${compact.slice(1)}`;
  if (compact.length === 12 && compact.startsWith('91')) return `+${compact}`;
  return compact;
}

export const E164_REGEX = /^\+[1-9]\d{6,14}$/;
