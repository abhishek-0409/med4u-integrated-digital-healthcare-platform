import { formatCurrency, sumRupees } from "./helpers";

describe("sumRupees", () => {
  it("adds through integer paise so float error never shows", () => {
    expect(sumRupees([0.1, 0.2])).toBe(0.3);
    expect(sumRupees([19.99, 19.99, 19.99])).toBe(59.97);
    expect(sumRupees([80 * 3, 9.99 * 2])).toBe(259.98);
  });

  it("handles empty input and negative adjustments (savings)", () => {
    expect(sumRupees([])).toBe(0);
    expect(sumRupees([100, -80])).toBe(20);
  });
});

describe("formatCurrency", () => {
  it("shows paise only when present", () => {
    expect(formatCurrency(1200)).toBe("₹1,200");
    expect(formatCurrency(31.35)).toBe("₹31.35");
    expect(formatCurrency(0)).toBe("₹0");
  });
});
