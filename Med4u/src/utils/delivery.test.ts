import { phoneDigits, toDeliveryRequest, validateDelivery } from "./delivery";

const valid = {
  name: "Asha Patel",
  phone: "98765 43210",
  line1: "12 Lake View Road",
  city: "Pune",
  pincode: "411038",
};

describe("validateDelivery", () => {
  it("accepts a complete address", () => {
    expect(validateDelivery(valid)).toEqual({});
  });

  it.each([
    ["name", { name: "A" }],
    ["phone", { phone: "12345" }],
    ["phone", { phone: "5876543210" }], // Indian mobiles start with 6-9
    ["line1", { line1: "x" }],
    ["city", { city: "" }],
    ["pincode", { pincode: "0123" }],
    ["pincode", { pincode: "41103" }],
  ])("flags a bad %s", (field, patch) => {
    expect(validateDelivery({ ...valid, ...patch })).toHaveProperty(field);
  });
});

describe("phone normalisation", () => {
  it("reduces common formats to 10 digits and sends the +91 form", () => {
    expect(phoneDigits("+91 98765-43210")).toBe("9876543210");
    expect(phoneDigits("09876543210")).toBe("9876543210");
    expect(toDeliveryRequest({ ...valid, phone: "+91 98765 43210" }).phone).toBe("+919876543210");
  });
});
