import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { makeProduct } from "../../test/fixtures";

jest.mock("../../services/order.service", () => ({ orderService: { quote: jest.fn(), create: jest.fn() } }));
jest.mock("../../services/prescription.service", () => ({ prescriptionService: { list: jest.fn() } }));
jest.mock("../../services/medicine.service", () => ({ medicineService: { getById: jest.fn() } }));
jest.mock("../../services/cartStorage", () => ({
  cartStorage: { load: jest.fn(), save: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock("../../store/authStore", () => ({
  useAuthStore: (select: (s: unknown) => unknown) => select({ user: { id: "u1", name: "Asha Patel", phone: "+919876543210" } }),
}));
// The picker itself is native-only; the screen just needs a way to hand it an uploaded prescription.
jest.mock("../../components/prescription/PrescriptionUploader", () => {
  const { Pressable, Text } = require("react-native");
  return {
    PrescriptionUploader: ({ onUploaded }: { onUploaded: (p: unknown) => void }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mock upload"
        onPress={() =>
          onUploaded({ id: "rx-1", status: "PENDING", mimeType: "image/png", sizeBytes: 10, createdAt: "2026-01-01T00:00:00Z", orderId: null })
        }
      >
        <Text>Mock upload</Text>
      </Pressable>
    ),
  };
});

import { ApiError } from "../../services/api/errors";
import { orderService } from "../../services/order.service";
import { prescriptionService } from "../../services/prescription.service";
import { medicineService } from "../../services/medicine.service";
import { useUserStore } from "../../store/userStore";
import { CheckoutScreen } from "./CheckoutScreen";

const quote = orderService.quote as jest.Mock;
const create = orderService.create as jest.Mock;
const listRx = prescriptionService.list as jest.Mock;

const navigation = { reset: jest.fn(), navigate: jest.fn() };
const renderCheckout = (params?: { clinicalPrescriptionId: string; prescriptionItems: Array<{ variantId: string; quantity: number }> }) =>
  render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}
    >
      <CheckoutScreen navigation={navigation as never} route={{ key: "k", name: "Checkout", params } as never} />
    </SafeAreaProvider>,
  );

const quoteFor = (items: Array<{ id: string; qty: number; rx?: boolean; price?: number }>) => {
  const lines = items.map((i) => {
    const product = makeProduct({ id: i.id, name: `Item ${i.id}`, requiresPrescription: Boolean(i.rx) });
    return {
      variantId: i.id,
      requestedQuantity: i.qty,
      product,
      issue: null,
      availableQuantity: 5,
      unitPrice: i.price ?? 80,
      lineTotal: (i.price ?? 80) * i.qty,
    };
  });
  return {
    lines,
    total: lines.reduce((n, l) => n + l.lineTotal, 0),
    requiresPrescription: items.some((i) => i.rx),
    canCheckout: true,
  };
};

function seedCart(items: Array<{ id: string; qty: number; rx?: boolean }>) {
  useUserStore.setState({
    cartOwner: null,
    cart: items.map((i) => ({
      id: i.id,
      quantity: i.qty,
      seenPrice: 80,
      product: makeProduct({ id: i.id, name: `Item ${i.id}`, requiresPrescription: Boolean(i.rx) }),
    })),
  });
}

async function fillForm() {
  fireEvent.changeText(screen.getByLabelText("Address"), "12 Lake View Road, Kothrud");
  fireEvent.changeText(screen.getByLabelText("City"), "Pune");
  fireEvent.changeText(screen.getByLabelText("PIN code"), "411038");
}

/** Waits until the screen has priced the cart and the Place order button is enabled. */
async function ready() {
  await waitFor(() => expect(screen.getByRole("button", { name: /^Place order/ })).toBeEnabled(), { timeout: 3000 });
}

beforeEach(() => {
  jest.clearAllMocks();
  listRx.mockResolvedValue({ items: [], meta: { page: 1, limit: 20, total: 0, totalPages: 1 } });
});

describe("Checkout: plain order", () => {
  beforeEach(() => {
    seedCart([{ id: "a", qty: 2 }]);
    quote.mockResolvedValue(quoteFor([{ id: "a", qty: 2 }]));
  });

  it("places the order with ids and quantities only, then clears the cart and shows the confirmation", async () => {
    create.mockResolvedValue({ id: "order-1" });
    renderCheckout();
    await ready();
    await fillForm();
    fireEvent.press(screen.getByRole("button", { name: /^Place order/ }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const request = create.mock.calls[0][0];
    expect(request.items).toEqual([{ variantId: "a", quantity: 2 }]);
    expect(request.expectedTotal).toBe(160); // the server-quoted total the customer was shown
    expect(request.delivery).toMatchObject({ phone: "+919876543210", pincode: "411038", city: "Pune" });
    expect(request).not.toHaveProperty("price");
    expect(request).not.toHaveProperty("total");
    expect(request.idempotencyKey).toEqual(expect.any(String));
    await waitFor(() =>
      expect(navigation.reset).toHaveBeenCalledWith({
        index: 1,
        routes: [{ name: "Home" }, { name: "OrderConfirmation", params: { orderId: "order-1" } }],
      }),
    );
    expect(useUserStore.getState().cart).toEqual([]);
  });

  it("does not submit an invalid address", async () => {
    renderCheckout();
    await ready();
    fireEvent.changeText(screen.getByLabelText("PIN code"), "12");
    fireEvent.press(screen.getByRole("button", { name: /^Place order/ }));
    expect(create).not.toHaveBeenCalled();
    expect(await screen.findByText("Enter a valid 6-digit PIN code.")).toBeTruthy();
  });

  it("sends only one request when the button is tapped repeatedly", async () => {
    let resolve!: (v: unknown) => void;
    create.mockReturnValue(new Promise((r) => (resolve = r)));
    renderCheckout();
    await ready();
    await fillForm();
    // Three presses inside one batch: the button has not re-rendered as disabled yet, so only the
    // in-flight guard can stop the duplicates.
    const button = screen.getByRole("button", { name: /^Place order/ });
    await act(async () => {
      fireEvent.press(button);
      fireEvent.press(button);
      fireEvent.press(button);
    });
    expect(create).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ id: "order-1" }));
    await waitFor(() => expect(navigation.reset).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("keeps the cart and explains an out-of-stock failure", async () => {
    create.mockRejectedValue(new ApiError("Only 1 pack(s) of Item a are in stock.", "http", 409, "INSUFFICIENT_STOCK"));
    renderCheckout();
    await ready();
    await fillForm();
    fireEvent.press(screen.getByRole("button", { name: /^Place order/ }));

    expect(await screen.findByText("Only 1 pack(s) of Item a are in stock.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Review cart" })).toBeTruthy();
    expect(navigation.reset).not.toHaveBeenCalled();
    expect(useUserStore.getState().cart).toHaveLength(1);
  });

  it("uses a fresh idempotency key after a rejected attempt", async () => {
    create.mockRejectedValueOnce(new ApiError("Stock changed.", "http", 409, "INSUFFICIENT_STOCK")).mockResolvedValue({ id: "order-2" });
    renderCheckout();
    await ready();
    await fillForm();
    fireEvent.press(screen.getByRole("button", { name: /^Place order/ }));
    await screen.findByText("Stock changed.");
    await ready();
    fireEvent.press(screen.getByRole("button", { name: /^Place order/ }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[0][0].idempotencyKey).not.toBe(create.mock.calls[1][0].idempotencyKey);
  });

  it("tells the customer when prices changed instead of silently charging more", async () => {
    create.mockRejectedValue(
      new ApiError("Prices changed since you last reviewed your cart.", "http", 409, "PRICE_CHANGED", { currentTotal: 190 }),
    );
    renderCheckout();
    await ready();
    await fillForm();
    fireEvent.press(screen.getByRole("button", { name: /^Place order/ }));
    expect(await screen.findByText("The price changed")).toBeTruthy();
    expect(navigation.reset).not.toHaveBeenCalled();
  });

  it("blocks checkout when the server says an item cannot be ordered", async () => {
    const q = quoteFor([{ id: "a", qty: 2 }]);
    quote.mockResolvedValue({ ...q, canCheckout: false, lines: [{ ...q.lines[0], issue: "OUT_OF_STOCK" }] });
    renderCheckout();
    expect(await screen.findByText("Some items can't be ordered")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Place order/ })).toBeDisabled();
  });
});

describe("Checkout: prescription-only items", () => {
  beforeEach(() => {
    seedCart([{ id: "rx", qty: 1, rx: true }]);
    quote.mockResolvedValue(quoteFor([{ id: "rx", qty: 1, rx: true }]));
  });

  it("requires a prescription before anything is sent", async () => {
    renderCheckout();
    await ready();
    await fillForm();
    expect(screen.getByText("2. Prescription")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: /^Place order/ }));
    expect(await screen.findByText("Add your prescription to order prescription-only medicines.")).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it("attaches the uploaded prescription to the order", async () => {
    create.mockResolvedValue({ id: "order-rx" });
    renderCheckout();
    await ready();
    await fillForm();
    fireEvent.press(screen.getByRole("button", { name: "Mock upload" }));
    fireEvent.press(screen.getByRole("button", { name: /^Place order/ }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0].prescriptionId).toBe("rx-1");
  });

  it("does not show the prescription section for ordinary carts", async () => {
    seedCart([{ id: "a", qty: 1 }]);
    quote.mockResolvedValue(quoteFor([{ id: "a", qty: 1 }]));
    renderCheckout();
    await ready();
    expect(screen.queryByText("2. Prescription")).toBeNull();
  });
});

describe("Checkout: doctor prescription", () => {
  it("quotes and submits selected products with the issued prescription without changing the ordinary cart", async () => {
    seedCart([{ id: "unrelated", qty: 1 }]);
    const product = makeProduct({ id: "variant-rx", requiresPrescription: true });
    jest.mocked(medicineService.getById).mockResolvedValue(product);
    quote.mockResolvedValue(quoteFor([{ id: "variant-rx", qty: 1, rx: true }]));
    create.mockResolvedValue({ id: "order-clinical" });
    renderCheckout({ clinicalPrescriptionId: "rx-clinical", prescriptionItems: [{ variantId: "variant-rx", quantity: 1 }] });
    await waitFor(() => expect(medicineService.getById).toHaveBeenCalledWith("variant-rx"));
    await ready();
    await fillForm();
    expect(screen.queryByText("2. Prescription")).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: /^Place order/ }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0]).toMatchObject({
      clinicalPrescriptionId: "rx-clinical",
      items: [{ variantId: "variant-rx", quantity: 1 }],
      expectedTotal: 80,
    });
    expect(create.mock.calls[0][0]).not.toHaveProperty("prescriptionId");
    expect(useUserStore.getState().cart.map((item) => item.id)).toEqual(["unrelated"]);
  });
});
