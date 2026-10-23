import { discountPercent, paiseToDecimal, paiseToRupees, toPaise } from './money.util';

describe('money.util', () => {
  it('parses decimal strings and numbers into integer paise without float drift', () => {
    expect(toPaise('0')).toBe(0);
    expect(toPaise('31.35')).toBe(3135);
    expect(toPaise('31.3')).toBe(3130);
    expect(toPaise(0.1 + 0.2)).toBe(30); // 0.30000000000000004 -> "0.30"
    expect(toPaise(1999)).toBe(199900);
  });

  it('rejects malformed or negative amounts', () => {
    expect(() => toPaise('-1.00')).toThrow(RangeError);
    expect(() => toPaise('1.234')).toThrow(RangeError);
    expect(() => toPaise('abc')).toThrow(RangeError);
    expect(() => paiseToDecimal(-5)).toThrow(RangeError);
    expect(() => paiseToDecimal(1.5)).toThrow(RangeError);
  });

  it('formats paise back to exact two-decimal strings and rupee numbers', () => {
    expect(paiseToDecimal(0)).toBe('0.00');
    expect(paiseToDecimal(5)).toBe('0.05');
    expect(paiseToDecimal(3135)).toBe('31.35');
    expect(paiseToRupees(3135)).toBe(31.35);
  });

  it('sums line totals exactly', () => {
    // 3 x 10.10 + 7 x 0.07 would drift in floats; in paise it is exact.
    expect(3 * toPaise('10.10') + 7 * toPaise('0.07')).toBe(3079);
  });

  it('computes discount percent with integer math', () => {
    expect(discountPercent(10000, 10000)).toBe(0);
    expect(discountPercent(10000, 9000)).toBe(10);
    expect(discountPercent(3300, 3135)).toBe(5);
    expect(discountPercent(0, 0)).toBe(0);
    expect(discountPercent(1000, 1200)).toBe(0); // never negative
  });
});
