export const LOW_STOCK_THRESHOLD = 10;
export const MAX_ORDER_QUANTITY = 10;

export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export interface ProductPrice {
  /** Maximum retail price, INR. */
  mrp: number;
  /** What the customer pays per pack, INR. Never above the MRP. */
  sellingPrice: number;
  /** Derived from mrp and sellingPrice (not stored). 0 when there is no discount. */
  discountPercent: number;
  source: string;
  /** True when the price is an illustrative demo value rather than a verified retail price. */
  isEstimate: boolean;
  updatedAt: string;
}

/** One purchasable catalog unit (a brand in one strength / form / pack size). */
export interface MedicineProduct {
  /** `variants.id`; this is the id used for detail lookups and in order items. */
  id: string;
  brandId: string;
  name: string;
  genericName: string;
  category: string;
  manufacturer: string | null;
  strength: string | null;
  form: string;
  packSize: string | null;
  description: string | null;
  imageUrl: string | null;
  requiresPrescription: boolean;
  isDemo: boolean;
  stockStatus: StockStatus;
  /** Largest quantity a customer can add in one order (min of stock and the per-line cap). */
  maxOrderQuantity: number;
  /** In stock and priced. Prescription rules are enforced separately when ordering. */
  purchasable: boolean;
  price: ProductPrice | null;
}

export interface MedicineCategory {
  category: string;
  count: number;
}
