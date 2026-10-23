import { create } from "zustand";
import { orderService } from "../services/order.service";
import { cartStorage, StoredCartLine } from "../services/cartStorage";
import { CartItem, MedicineProduct } from "../types/medicine";

/** Keeps the persisted cart well inside the keystore's size limit. The server allows 30 lines. */
export const MAX_CART_LINES = 20;
const MAX_LINE_QUANTITY = 10;

interface UserState {
  cart: CartItem[];
  /** The user whose cart is in memory and being saved. Null until the saved cart has been restored. */
  cartOwner: string | null;
  /**
   * Adds one pack. Returns false (and changes nothing) when the product cannot be ordered:
   * out of stock, unpriced, already at its quantity cap, or the cart is full.
   * Prescription-only products can be added; the prescription is collected at checkout.
   */
  addToCart: (product: MedicineProduct) => boolean;
  /** Sets an exact quantity, clamped to the product's cap; 0 removes the line. */
  setCartQuantity: (id: string, quantity: number) => void;
  removeFromCart: (id: string) => void;
  /** Replaces product snapshots with fresh server data. Lines are kept so the customer can see what changed. */
  syncCartProducts: (fresh: MedicineProduct[]) => void;
  /** Marks the current prices as seen, clearing price-change notices. */
  acknowledgePrices: () => void;
  /** Restores the saved cart for this user and refreshes it from the server. Safe to call repeatedly. */
  hydrateCart: (userId: string) => Promise<void>;
  clearCart: () => void;
  /** Drops per-user data from memory when the session ends (the saved cart stays on the device). */
  resetUserData: () => void;
}

/** In stock and priced. Prescription rules are enforced by the server at checkout. */
export const isOrderable = (product: MedicineProduct): boolean =>
  product.purchasable && product.price !== null;

export const sellingPriceOf = (product: MedicineProduct): number => product.price?.sellingPrice ?? 0;

/** Keeps a line within what the product currently allows (at least 1 so unavailable lines stay visible). */
const clampToProduct = (quantity: number, product: MedicineProduct): number =>
  Math.max(1, Math.min(Math.floor(quantity), product.maxOrderQuantity || 1));

export const useUserStore = create<UserState>((set, get) => ({
  cart: [],
  cartOwner: null,

  addToCart: (product) => {
    if (!isOrderable(product)) {
      return false;
    }
    const existing = get().cart.find((item) => item.id === product.id);
    if (existing && existing.quantity >= product.maxOrderQuantity) {
      return false;
    }
    if (!existing && get().cart.length >= MAX_CART_LINES) {
      return false;
    }
    set((state) => ({
      cart: existing
        ? state.cart.map((item) =>
            item.id === product.id ? { ...item, product, quantity: item.quantity + 1 } : item,
          )
        : [...state.cart, { id: product.id, product, quantity: 1, seenPrice: sellingPriceOf(product) }],
    }));
    return true;
  },

  setCartQuantity: (id, quantity) =>
    set((state) => ({
      cart: state.cart
        .map((item) =>
          item.id === id
            ? { ...item, quantity: Math.min(Math.floor(quantity), item.product.maxOrderQuantity) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    })),

  removeFromCart: (id) => set((state) => ({ cart: state.cart.filter((item) => item.id !== id) })),

  syncCartProducts: (fresh) =>
    set((state) => {
      const byId = new Map(fresh.map((p) => [p.id, p]));
      return {
        cart: state.cart.map((item) => {
          const product = byId.get(item.id);
          return product ? { ...item, product, quantity: clampToProduct(item.quantity, product) } : item;
        }),
      };
    }),

  acknowledgePrices: () =>
    set((state) => ({
      cart: state.cart.map((item) => ({ ...item, seenPrice: sellingPriceOf(item.product) })),
    })),

  hydrateCart: async (userId) => {
    if (get().cartOwner === userId) {
      return;
    }
    const stored = await cartStorage.load(userId);
    // Anything added before the saved cart finished loading is merged in, not overwritten.
    const merged = new Map<string, StoredCartLine>(stored.map((line) => [line.id, line]));
    for (const item of get().cart) {
      const saved = merged.get(item.id);
      merged.set(item.id, {
        id: item.id,
        q: Math.min((saved?.q ?? 0) + item.quantity, MAX_LINE_QUANTITY),
        p: saved?.p ?? item.seenPrice,
      });
    }
    const lines = [...merged.values()].slice(0, MAX_CART_LINES);
    if (lines.length === 0) {
      set({ cartOwner: userId });
      return;
    }
    try {
      // The server is the source of truth for names, stock and prices.
      const quote = await orderService.quote(lines.map((l) => ({ variantId: l.id, quantity: l.q })));
      const savedById = new Map(lines.map((l) => [l.id, l]));
      const cart = quote.lines.flatMap((line): CartItem[] => {
        const saved = savedById.get(line.variantId);
        if (!line.product || !saved) return []; // no longer sold: drop it
        return [
          {
            id: line.variantId,
            product: line.product,
            quantity: clampToProduct(saved.q, line.product),
            seenPrice: saved.p,
          },
        ];
      });
      set({ cart, cartOwner: userId });
    } catch {
      // Offline or server trouble: leave the saved cart untouched and retry the next time the cart opens.
    }
  },

  clearCart: () => set({ cart: [] }),

  resetUserData: () => set({ cart: [], cartOwner: null }),
}));

// Save the cart whenever it changes. Nothing is written until the saved cart has been restored, so a
// fresh empty start can never wipe a cart saved earlier.
useUserStore.subscribe((state, previous) => {
  if (state.cartOwner && (state.cart !== previous.cart || state.cartOwner !== previous.cartOwner)) {
    void cartStorage.save(
      state.cartOwner,
      state.cart.map((item) => ({ id: item.id, q: item.quantity, p: item.seenPrice })),
    );
  }
});
