/**
 * Money is handled as integer paise (1 INR = 100 paise) so totals never go through floating point.
 * Postgres `numeric(_,2)` columns arrive from the driver as exact decimal strings, e.g. "42.50".
 */

const DECIMAL_RE = /^(\d{1,10})(?:\.(\d{1,2}))?$/;

/** Parses a non-negative decimal string/number with at most 2 decimals into integer paise. */
export function toPaise(value: string | number): number {
  const text = typeof value === 'number' ? value.toFixed(2) : value.trim();
  const match = DECIMAL_RE.exec(text);
  if (!match) {
    throw new RangeError(`Invalid monetary amount: ${JSON.stringify(value)}`);
  }
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

/** Integer paise -> exact decimal string for a numeric(_,2) column, e.g. 4250 -> "42.50". */
export function paiseToDecimal(paise: number): string {
  if (!Number.isInteger(paise) || paise < 0) {
    throw new RangeError(`Invalid paise amount: ${paise}`);
  }
  return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;
}

/** Integer paise -> rupees as a JSON number (always an exact 2-decimal value). Display only. */
export function paiseToRupees(paise: number): number {
  return Number(paiseToDecimal(paise));
}

/** Discount of `sellingPaise` against `mrpPaise`, in percent with one decimal, using integer math. */
export function discountPercent(mrpPaise: number, sellingPaise: number): number {
  if (mrpPaise <= 0 || sellingPaise >= mrpPaise) return 0;
  return Math.round(((mrpPaise - sellingPaise) * 1000) / mrpPaise) / 10;
}
