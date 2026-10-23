import { MedicineProduct } from "../types/medicine";

/** A purchasable, non-prescription product; override any field per test. */
export const makeProduct = (overrides: Partial<MedicineProduct> = {}): MedicineProduct => ({
  id: "v-1",
  brandId: "b-1",
  name: "Paracetamol 500",
  genericName: "Paracetamol",
  category: "Pain relief",
  manufacturer: null,
  strength: "500 mg",
  form: "tablet",
  packSize: "Strip of 10",
  description: null,
  imageUrl: null,
  requiresPrescription: false,
  isDemo: false,
  stockStatus: "IN_STOCK",
  maxOrderQuantity: 5,
  purchasable: true,
  price: {
    mrp: 100,
    sellingPrice: 80,
    discountPercent: 20,
    source: "MANUAL",
    isEstimate: false,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  ...overrides,
});
