import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

jest.mock("../../services/lab.service", () => ({ labService: { catalog: jest.fn(), bookings: jest.fn() } }));

import { labService } from "../../services/lab.service";
import { LabBooking, LabTest } from "../../types/lab";
import { BookTestScreen } from "./BookTestScreen";

const catalog = labService.catalog as jest.Mock;
const bookings = labService.bookings as jest.Mock;
const navigation = { navigate: jest.fn(), addListener: jest.fn(() => () => undefined) };

const lab = (o: Partial<LabTest>): LabTest => ({
  id: "t1", name: "Complete Blood Count (CBC)", category: "Blood Test", description: "Measures blood cells.", price: 250,
  turnaroundDays: 1, sampleType: "Blood", preparationInstructions: "No special preparation.", homeCollectionAvailable: false,
  labLocation: "Demo", isDemo: true, ...o,
});
const booking: LabBooking = {
  id: "b1", reference: "LAB-ABCD1234", testId: "t1", preferredDate: "2999-01-01", preferredTime: "09:00", homeCollection: false,
  status: "pending", priceSnapshot: 250, createdAt: "", test: { name: "Complete Blood Count (CBC)", category: "Blood Test", isDemo: true },
};

const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
      <BookTestScreen navigation={navigation as never} route={{ key: "k", name: "BookTest" } as never} />
    </SafeAreaProvider>,
  );

beforeEach(() => { jest.clearAllMocks(); bookings.mockResolvedValue([]); });

describe("BookTestScreen", () => {
  it("shows the heading and catalog cards with price and a Book Test button", async () => {
    catalog.mockResolvedValue([lab({}), lab({ id: "t2", name: "Lipid Profile", price: 500 })]);
    renderScreen();
    expect(screen.getByText("Book Lab Tests")).toBeTruthy();
    expect(await screen.findByText("Lipid Profile")).toBeTruthy();
    expect(screen.getByText("Complete Blood Count (CBC)")).toBeTruthy();
    expect(screen.getByText("₹500")).toBeTruthy();
    expect(screen.getAllByText("Demo listing")).toHaveLength(2);
    fireEvent.press(screen.getByLabelText("Book Complete Blood Count (CBC)"));
    expect(navigation.navigate).toHaveBeenCalledWith("LabTestDetail", { test: expect.objectContaining({ id: "t1" }) });
  });

  it("searches by test name and shows a no-match state", async () => {
    catalog.mockResolvedValue([lab({}), lab({ id: "t2", name: "Lipid Profile" })]);
    renderScreen();
    await screen.findByText("Lipid Profile");
    fireEvent.changeText(screen.getByLabelText("Search lab tests"), "lipid");
    expect(screen.queryByText("Complete Blood Count (CBC)")).toBeNull();
    fireEvent.changeText(screen.getByLabelText("Search lab tests"), "zzz");
    expect(screen.getByText("No matching tests")).toBeTruthy();
  });

  it("shows an empty state when the catalog is empty", async () => {
    catalog.mockResolvedValue([]);
    renderScreen();
    expect(await screen.findByText("No lab tests available")).toBeTruthy();
  });

  it("shows an error and retries", async () => {
    catalog.mockRejectedValueOnce(new Error("boom")).mockResolvedValue([lab({})]);
    renderScreen();
    expect(await screen.findByText("Couldn't load lab tests")).toBeTruthy();
    fireEvent.press(screen.getByText("Try again"));
    expect(await screen.findByText("Complete Blood Count (CBC)")).toBeTruthy();
  });

  it("lists upcoming bookings with their reference and opens them", async () => {
    catalog.mockResolvedValue([lab({})]);
    bookings.mockResolvedValue([booking]);
    renderScreen();
    expect(await screen.findByText("Upcoming")).toBeTruthy();
    expect(screen.getByText(/LAB-ABCD1234/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText(/View booking/));
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith("LabBookingConfirmation", { booking }));
  });
});
