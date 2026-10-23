/** Mirrors the backend MedicineProduct (GET /v1/medicines). */
export type StockStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

export interface ProductPrice {
  /** Maximum retail price, INR. */
  mrp: number;
  /** What the customer pays per pack, INR (never above the MRP). */
  sellingPrice: number;
  /** Derived by the server from mrp and sellingPrice. */
  discountPercent: number;
  source: string;
  /** True for illustrative demo prices (not verified retail prices). */
  isEstimate: boolean;
  updatedAt: string;
}

export interface MedicineProduct {
  /** Purchasable unit id (a brand in one strength / form / pack size). */
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
  /** Largest quantity that can be ordered at once (min of stock and the per-order cap). */
  maxOrderQuantity: number;
  /** In stock and priced. */
  purchasable: boolean;
  price: ProductPrice | null;
}

export interface MedicineCategory {
  category: string;
  count: number;
}

export type MedicineSort = "name" | "price_asc" | "price_desc";

export interface MedicineListParams {
  search?: string;
  category?: string;
  requiresPrescription?: boolean;
  inStock?: boolean;
  sortBy?: MedicineSort;
  page?: number;
  limit?: number;
}

export interface CartItem {
  /** Same as product.id. */
  id: string;
  /** Latest server snapshot of the product (refreshed whenever the cart is priced). */
  product: MedicineProduct;
  quantity: number;
  /** Selling price (INR) the customer last saw for this line; used to flag later price changes. */
  seenPrice: number;
}
