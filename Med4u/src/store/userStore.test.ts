import { makeProduct } from "../test/fixtures";

jest.mock("../services/cartStorage", () => ({
  cartStorage: { load: jest.fn(), save: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock("../services/order.service", () => ({ orderService: { quote: jest.fn() } }));

import { cartStorage } from "../services/cartStorage";
import { orderService } from "../services/order.service";
import { MAX_CART_LINES, isOrderable, useUserStore } from "./userStore";

const store = () => useUserStore.getState();
const mockedStorage = cartStorage as jest.Mocked<typeof cartStorage>;
const mockedQuote = orderService.quote as jest.Mock;

const quoteLine = (id: string, product: ReturnType<typeof makeProduct> | null, quantity = 1, issue: string | null = null) => ({
  variantId: id,
  requestedQuantity: quantity,
  product,
  issue,
  availableQuantity: 5,
  unitPrice: 80,
  lineTotal: 80 * quantity,
});

beforeEach(() => {
  jest.clearAllMocks();
  useUserStore.setState({ cart: [], cartOwner: null });
});

describe("adding to the cart", () => {
  it("adds a new line with quantity 1 and remembers the price it showed", () => {
    expect(store().addToCart(makeProduct())).toBe(true);
    expect(store().cart).toEqual([expect.objectContaining({ id: "v-1", quantity: 1, seenPrice: 80 })]);
  });

  it("increments an existing line instead of duplicating it", () => {
    store().addToCart(makeProduct());
    store().addToCart(makeProduct());
    expect(store().cart).toHaveLength(1);
    expect(store().cart[0].quantity).toBe(2);
  });

  it("refuses to go past the available stock / per-order cap", () => {
    const p = makeProduct({ maxOrderQuantity: 2 });
    expect(store().addToCart(p)).toBe(true);
    expect(store().addToCart(p)).toBe(true);
    expect(store().addToCart(p)).toBe(false);
    expect(store().cart[0].quantity).toBe(2);
  });

  it("refuses out-of-stock and unpriced products", () => {
    const soldOut = makeProduct({ purchasable: false, stockStatus: "OUT_OF_STOCK", maxOrderQuantity: 0 });
    expect(store().addToCart(soldOut)).toBe(false);
    expect(store().addToCart(makeProduct({ id: "v-2", price: null }))).toBe(false);
    expect(store().cart).toEqual([]);
  });

  it("allows prescription-only products (the prescription is collected at checkout)", () => {
    const rx = makeProduct({ id: "rx", requiresPrescription: true });
    expect(isOrderable(rx)).toBe(true);
    expect(store().addToCart(rx)).toBe(true);
  });

  it("caps the number of distinct lines", () => {
    for (let i = 0; i < MAX_CART_LINES; i++) store().addToCart(makeProduct({ id: `v-${i}` }));
    expect(store().addToCart(makeProduct({ id: "one-too-many" }))).toBe(false);
    expect(store().cart).toHaveLength(MAX_CART_LINES);
  });
});

describe("changing quantities", () => {
  beforeEach(() => {
    store().addToCart(makeProduct({ maxOrderQuantity: 5 }));
  });

  it("sets an exact quantity", () => {
    store().setCartQuantity("v-1", 4);
    expect(store().cart[0].quantity).toBe(4);
  });

  it("clamps to the product cap and floors fractions", () => {
    store().setCartQuantity("v-1", 99);
    expect(store().cart[0].quantity).toBe(5);
    store().setCartQuantity("v-1", 2.9);
    expect(store().cart[0].quantity).toBe(2);
  });

  it("removes the line at zero", () => {
    store().setCartQuantity("v-1", 0);
    expect(store().cart).toEqual([]);
  });

  it("removeFromCart and clearCart empty things out", () => {
    store().addToCart(makeProduct({ id: "v-2" }));
    store().removeFromCart("v-1");
    expect(store().cart.map((i) => i.id)).toEqual(["v-2"]);
    store().clearCart();
    expect(store().cart).toEqual([]);
  });
});

describe("server refresh (stock and price changes)", () => {
  it("keeps the line but trims the quantity when stock drops", () => {
    store().addToCart(makeProduct({ maxOrderQuantity: 5 }));
    store().setCartQuantity("v-1", 5);
    store().syncCartProducts([makeProduct({ maxOrderQuantity: 2 })]);
    expect(store().cart[0].quantity).toBe(2);
  });

  it("keeps an out-of-stock line visible so the customer can remove it", () => {
    store().addToCart(makeProduct());
    store().syncCartProducts([
      makeProduct({ purchasable: false, stockStatus: "OUT_OF_STOCK", maxOrderQuantity: 0 }),
    ]);
    expect(store().cart).toHaveLength(1);
    expect(store().cart[0].quantity).toBe(1);
    expect(isOrderable(store().cart[0].product)).toBe(false);
  });

  it("flags a price change until it is acknowledged", () => {
    store().addToCart(makeProduct());
    const repriced = makeProduct({ price: { ...makeProduct().price!, sellingPrice: 90 } });
    store().syncCartProducts([repriced]);
    expect(store().cart[0].product.price?.sellingPrice).toBe(90);
    expect(store().cart[0].seenPrice).toBe(80); // still the price the customer saw
    store().acknowledgePrices();
    expect(store().cart[0].seenPrice).toBe(90);
  });
});

describe("persistence", () => {
  it("does not write anything before the saved cart is restored", () => {
    store().addToCart(makeProduct());
    expect(mockedStorage.save).not.toHaveBeenCalled();
  });

  it("restores the saved cart using the server view, then saves later changes", async () => {
    mockedStorage.load.mockResolvedValue([{ id: "v-1", q: 3, p: 75 }]);
    mockedQuote.mockResolvedValue({
      lines: [quoteLine("v-1", makeProduct(), 3)],
      total: 240,
      requiresPrescription: false,
      canCheckout: true,
    });
    await store().hydrateCart("user-1");
    expect(mockedQuote).toHaveBeenCalledWith([{ variantId: "v-1", quantity: 3 }]);
    expect(store().cartOwner).toBe("user-1");
    // The server price is 80 but the customer last saw 75, so the change can be surfaced.
    expect(store().cart[0]).toMatchObject({ quantity: 3, seenPrice: 75 });
    expect(store().cart[0].product.price?.sellingPrice).toBe(80);

    store().setCartQuantity("v-1", 2);
    expect(mockedStorage.save).toHaveBeenLastCalledWith("user-1", [{ id: "v-1", q: 2, p: 75 }]);
  });

  it("drops saved items the server no longer sells", async () => {
    mockedStorage.load.mockResolvedValue([{ id: "gone", q: 1, p: 10 }]);
    mockedQuote.mockResolvedValue({
      lines: [quoteLine("gone", null, 1, "NOT_FOUND")],
      total: 0,
      requiresPrescription: false,
      canCheckout: false,
    });
    await store().hydrateCart("user-1");
    expect(store().cart).toEqual([]);
  });

  it("leaves the saved cart untouched when the server is unreachable", async () => {
    mockedStorage.load.mockResolvedValue([{ id: "v-1", q: 1, p: 80 }]);
    mockedQuote.mockRejectedValue(new Error("offline"));
    await store().hydrateCart("user-1");
    expect(store().cartOwner).toBeNull(); // not restored, so nothing will overwrite the saved copy
    expect(mockedStorage.save).not.toHaveBeenCalled();
  });

  it("merges items added before the restore finished instead of losing them", async () => {
    store().addToCart(makeProduct({ id: "new", maxOrderQuantity: 5 }));
    mockedStorage.load.mockResolvedValue([{ id: "v-1", q: 1, p: 80 }]);
    mockedQuote.mockImplementation(async (items: Array<{ variantId: string; quantity: number }>) => ({
      lines: items.map((i) => quoteLine(i.variantId, makeProduct({ id: i.variantId }), i.quantity)),
      total: 0,
      requiresPrescription: false,
      canCheckout: true,
    }));
    await store().hydrateCart("user-1");
    expect(store().cart.map((i) => i.id).sort()).toEqual(["new", "v-1"]);
  });

  it("resetUserData clears memory without erasing the saved cart", () => {
    useUserStore.setState({ cartOwner: "user-1" });
    store().addToCart(makeProduct());
    mockedStorage.save.mockClear();
    store().resetUserData();
    expect(store().cart).toEqual([]);
    expect(mockedStorage.save).not.toHaveBeenCalled();
  });
});
