/**
 * Mirrors the backend's normalizePhone (Med4u-backend/src/common/utils/phone.util.ts) so the number the
 * user typed is shown and submitted in the same canonical E.164 form the server will store.
 * Bare 10-digit numbers are treated as Indian national numbers (+91); anything with its own "+" keeps it.
 */
export function normalizePhone(raw: string): string {
  const compact = raw.trim().replace(/[\s().-]/g, "");
  if (compact.startsWith("+")) return `+${compact.slice(1).replace(/\D/g, "")}`;
  if (!/^\d+$/.test(compact)) return compact;
  if (compact.startsWith("00")) return `+${compact.slice(2)}`;
  if (compact.length === 10) return `+91${compact}`;
  if (compact.length === 11 && compact.startsWith("0")) return `+91${compact.slice(1)}`;
  if (compact.length === 12 && compact.startsWith("91")) return `+${compact}`;
  return compact;
}

export const E164 = /^\+[1-9]\d{6,14}$/;
