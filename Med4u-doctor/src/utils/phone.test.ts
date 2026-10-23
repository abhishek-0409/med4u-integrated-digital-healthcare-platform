import { E164, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it.each([
    ["1111111111", "+911111111111"],
    ["  11111 11111 ", "+911111111111"],
    ["01111111111", "+911111111111"],
    ["911111111111", "+911111111111"],
    ["+91 98765-43210", "+919876543210"],
    ["(+91) 98765 43210", "+919876543210"],
    ["+14155552671", "+14155552671"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it("is idempotent and rejects garbage", () => {
    expect(normalizePhone(normalizePhone("1111111111"))).toBe("+911111111111");
    for (const bad of ["12345", "abcdefghij", "", "+"]) expect(E164.test(normalizePhone(bad))).toBe(false);
  });
});
