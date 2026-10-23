import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

jest.mock("../../services/lab.service", () => ({ labService: { book: jest.fn() } }));
jest.mock("../../store/authStore", () => ({
  useAuthStore: (select: (s: unknown) => unknown) => select({ user: { id: "u1", name: "Asha Patel", phone: "+919876543210" } }),
}));

import { ApiError } from "../../services/api/errors";
import { labService } from "../../services/lab.service";
import { LabTest } from "../../types/lab";
import { formatLabDate, upcomingDates } from "../../utils/lab";
import { LabTestDetailScreen } from "./LabTestDetailScreen";

const book = labService.book as jest.Mock;
const navigation = { replace: jest.fn() };
const lab: LabTest = {
  id: "t1", name: "Complete Blood Count (CBC)", category: "Blood Test", description: "Measures blood cells.", price: 250,
  turnaroundDays: 1, sampleType: "Blood", preparationInstructions: "No special preparation.", homeCollectionAvailable: false,
  labLocation: "Demo", isDemo: true,
};

const renderScreen = (test: LabTest = lab) =>
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
      <LabTestDetailScreen navigation={navigation as never} route={{ key: "k", name: "LabTestDetail", params: { test } } as never} />
    </SafeAreaProvider>,
  );

// A day a few days out has every slot in the future.
const pickSlot = () => {
  fireEvent.press(screen.getByLabelText(formatLabDate(upcomingDates(61)[5])));
  fireEvent.press(screen.getByLabelText("6:00 PM, available"));
};

beforeEach(() => jest.clearAllMocks());

describe("LabTestDetailScreen", () => {
  it("shows test details and a summary with catalog price and total", () => {
    renderScreen();
    expect(screen.getByText("Total")).toBeTruthy();
    expect(screen.getAllByText(/250/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Collection fee")).toBeNull();
    expect(screen.getByText("Home collection is not available for this test.")).toBeTruthy();
  });

  it("blocks submission until a time slot is chosen", () => {
    renderScreen();
    fireEvent.press(screen.getByText("Confirm booking"));
    expect(screen.getByText("Choose a time slot.")).toBeTruthy();
    expect(book).not.toHaveBeenCalled();
  });

  it("books with only the patient's choices and opens the confirmation", async () => {
    const created = { id: "b1", reference: "LAB-1" };
    book.mockResolvedValue(created);
    renderScreen();
    pickSlot();
    fireEvent.press(screen.getByText("Confirm booking"));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("LabBookingConfirmation", { booking: created }));
    const payload = book.mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual(["contactName", "contactPhone", "homeCollection", "preferredDate", "preferredTime", "testId"]);
    expect(payload).toMatchObject({ testId: "t1", preferredTime: "18:00", homeCollection: false, contactName: "Asha Patel" });
  });

  it("requires an address for home collection", () => {
    renderScreen({ ...lab, homeCollectionAvailable: true });
    pickSlot();
    fireEvent.press(screen.getByLabelText("Home collection"));
    fireEvent.press(screen.getByText("Confirm booking"));
    expect(screen.getByText(/collection address/i)).toBeTruthy();
    expect(book).not.toHaveBeenCalled();
  });

  it("shows the server's error and stays on the screen when booking fails", async () => {
    book.mockRejectedValue(new ApiError("You already have a lab booking at that time.", "http", 409, "LAB_SLOT_TAKEN"));
    renderScreen();
    pickSlot();
    fireEvent.press(screen.getByText("Confirm booking"));
    expect(await screen.findByText("You already have a lab booking at that time.")).toBeTruthy();
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
