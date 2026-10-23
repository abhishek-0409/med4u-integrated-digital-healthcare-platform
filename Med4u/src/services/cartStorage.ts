import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/** One persisted cart line. Kept tiny: the keystore caps a value at ~2 KB. */
export interface StoredCartLine {
  /** Product (variant) id. */
  id: string;
  /** Quantity. */
  q: number;
  /** Price the customer last saw. */
  p: number;
}

const keyFor = (userId: string): string => `med4u.cart.${userId}`;

const isLine = (value: unknown): value is StoredCartLine => {
  const v = value as StoredCartLine;
  return (
    typeof v?.id === "string" &&
    Number.isInteger(v.q) &&
    v.q > 0 &&
    v.q <= 10 &&
    typeof v.p === "number" &&
    Number.isFinite(v.p)
  );
};

/**
 * Per-user cart persistence. Only ids, quantities and last-seen prices are stored (nothing sensitive);
 * names, stock and current prices are re-fetched from the server whenever the cart is restored.
 */
export const cartStorage = {
  async load(userId: string): Promise<StoredCartLine[]> {
    try {
      const raw =
        Platform.OS === "web"
          ? globalThis.localStorage?.getItem(keyFor(userId))
          : await SecureStore.getItemAsync(keyFor(userId));
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(isLine) : [];
    } catch {
      return []; // unreadable storage just means an empty cart
    }
  },

  async save(userId: string, lines: StoredCartLine[]): Promise<void> {
    try {
      if (Platform.OS === "web") {
        if (lines.length === 0) globalThis.localStorage?.removeItem(keyFor(userId));
        else globalThis.localStorage?.setItem(keyFor(userId), JSON.stringify(lines));
      } else if (lines.length === 0) {
        await SecureStore.deleteItemAsync(keyFor(userId));
      } else {
        await SecureStore.setItemAsync(keyFor(userId), JSON.stringify(lines));
      }
    } catch {
      // Persistence is best effort; the in-memory cart keeps working.
    }
  },
};
