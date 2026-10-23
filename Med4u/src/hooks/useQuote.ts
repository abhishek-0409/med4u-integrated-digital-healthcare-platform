import { useCallback } from "react";
import { orderService } from "../services/order.service";
import { CartItem } from "../types/medicine";
import { Quote } from "../types/order";
import { useAsyncData } from "./useAsyncData";
import { useDebouncedValue } from "./useDebouncedValue";

/**
 * Prices the cart on the server (current price, stock, total). Re-runs when lines or quantities change,
 * after a short pause so tapping a stepper repeatedly sends one request.
 */
export function useQuote(cart: CartItem[]) {
  const signature = cart.map((item) => `${item.id}:${item.quantity}`).join(",");
  const settled = useDebouncedValue(signature, 250);

  const load = useCallback(async (): Promise<Quote | null> => {
    if (!settled) return null;
    const items = settled.split(",").map((part) => {
      const [variantId, quantity] = part.split(":");
      return { variantId, quantity: Number(quantity) };
    });
    return orderService.quote(items);
  }, [settled]);

  const state = useAsyncData(load, [load]);
  // True while the quote on screen is for an older cart than the one the customer sees.
  const stale = settled !== signature;
  return { ...state, quote: state.data ?? null, stale };
}
