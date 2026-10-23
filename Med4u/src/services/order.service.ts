import { Paginated } from "../types/api";
import { CreateOrderRequest, Order, Quote } from "../types/order";
import { api } from "./api/client";

export const orderService = {
  /** Current server prices, stock problems and total for a cart. Reserves nothing. */
  quote(items: Array<{ variantId: string; quantity: number }>): Promise<Quote> {
    return api.post<Quote>("/v1/orders/quote", { items });
  },

  /**
   * Rejects with an ApiError: 409 INSUFFICIENT_STOCK / MEDICINE_UNAVAILABLE / PRICE_CHANGED /
   * PRESCRIPTION_ALREADY_USED, 422 PRESCRIPTION_REQUIRED / PRESCRIPTION_INVALID / PRESCRIPTION_NOT_USABLE.
   */
  create(request: CreateOrderRequest): Promise<Order> {
    return api.post<Order>("/v1/orders", request);
  },

  list(params: { page?: number; limit?: number } = {}): Promise<Paginated<Order>> {
    return api.getPage<Order>("/v1/orders", { params });
  },

  getById(id: string): Promise<Order> {
    return api.get<Order>(`/v1/orders/${encodeURIComponent(id)}`);
  },

  cancel(id: string, reason?: string): Promise<Order> {
    return api.patch<Order>(`/v1/orders/${encodeURIComponent(id)}/cancel`, reason ? { reason } : {});
  },
};
