import { DeliveryDetails } from "../types/order";

/** Mirrors the server's delivery rules so mistakes are caught before a request is sent. */
export type DeliveryErrors = Partial<Record<keyof DeliveryDetails, string>>;

const MOBILE = /^[6-9]\d{9}$/;
const PINCODE = /^[1-9]\d{5}$/;

/** Reduces "+91 98765-43210" or "098765 43210" to the 10 digits that matter. */
export const phoneDigits = (value: string): string => {
  const digits = value.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
};

export function validateDelivery(values: DeliveryDetails): DeliveryErrors {
  const errors: DeliveryErrors = {};
  if (values.name.trim().length < 2) errors.name = "Enter the recipient's name.";
  if (!MOBILE.test(phoneDigits(values.phone))) errors.phone = "Enter a valid 10-digit mobile number.";
  if (values.line1.trim().length < 5) errors.line1 = "Enter house or flat number, street and area.";
  if (values.city.trim().length < 2) errors.city = "Enter the city.";
  if (!PINCODE.test(values.pincode.trim())) errors.pincode = "Enter a valid 6-digit PIN code.";
  return errors;
}

/** The shape sent to the server, with the phone normalised. */
export const toDeliveryRequest = (values: DeliveryDetails): DeliveryDetails => ({
  name: values.name.trim(),
  phone: `+91${phoneDigits(values.phone)}`,
  line1: values.line1.trim(),
  city: values.city.trim(),
  pincode: values.pincode.trim(),
});
