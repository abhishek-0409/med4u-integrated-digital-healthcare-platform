import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AvailabilityScreen } from "./AvailabilityScreen";
import { doctorProfileApi } from "../services/appointmentApi";
const mockReact = require("react");
const mockRN = require("react-native");

jest.mock("../components/ui", () => ({
  Page: ({ children }: { children: unknown }) => mockReact.createElement(mockRN.View, null, children),
  TopBar: () => null,
  Card: ({ children }: { children: unknown }) => mockReact.createElement(mockRN.View, null, children),
  ActionButton: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) =>
    mockReact.createElement(mockRN.Pressable, { accessibilityRole: "button", accessibilityState: { disabled: Boolean(disabled) }, onPress }, mockReact.createElement(mockRN.Text, null, label)),
}));
jest.mock("../services/appointmentApi", () => ({ doctorProfileApi: { self: jest.fn(), saveAvailability: jest.fn() } }));

const emptySavedProfile = { availabilitySchedule: {} } as never;

describe("AvailabilityScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("loads backend schedules, publishes edits, and restores the saved response", async () => {
    jest.mocked(doctorProfileApi.self).mockResolvedValue(emptySavedProfile);
    jest.mocked(doctorProfileApi.saveAvailability).mockResolvedValue({
      availabilitySchedule: { monday: { intervals: [{ start: "00:00", end: "08:00" }, { start: "09:00", end: "12:00" }] } },
    } as never);
    render(<AvailabilityScreen navigation={{} as never} route={{} as never} />);
    expect(await screen.findByText("No availability is published. Turn on a day and add your clinic hours.")).toBeTruthy();
    fireEvent(screen.getByLabelText("Monday availability"), "valueChange", true);
    fireEvent.press(screen.getByText("Add interval"));
    fireEvent.press(screen.getByText("Save & publish availability"));
    await waitFor(() => expect(doctorProfileApi.saveAvailability).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Availability saved and published.")).toBeTruthy();
    expect(doctorProfileApi.saveAvailability).toHaveBeenCalledWith(expect.objectContaining({ monday: expect.objectContaining({ intervals: expect.any(Array) }) }));
  });

  it("shows an API error and retries the load", async () => {
    jest.mocked(doctorProfileApi.self).mockRejectedValueOnce(new Error("network failed")).mockResolvedValueOnce(emptySavedProfile);
    render(<AvailabilityScreen navigation={{} as never} route={{} as never} />);
    expect(await screen.findByText("network failed")).toBeTruthy();
    fireEvent.press(screen.getByText("Retry"));
    expect(await screen.findByText("No availability is published. Turn on a day and add your clinic hours.")).toBeTruthy();
    expect(doctorProfileApi.self).toHaveBeenCalledTimes(2);
  });

  it("opens the in-app picker and keeps 12 AM distinct as midnight", async () => {
    jest.mocked(doctorProfileApi.self).mockResolvedValue(emptySavedProfile);
    render(<AvailabilityScreen navigation={{} as never} route={{} as never} />);
    await screen.findByText("No availability is published. Turn on a day and add your clinic hours.");
    fireEvent(screen.getByLabelText("Monday availability"), "valueChange", true);
    fireEvent.press(screen.getByLabelText("Monday, interval 1 start, 9:00 AM"));
    expect(screen.getByText("12:00 AM = midnight · 12:00 PM = noon")).toBeTruthy();
    for (let press = 0; press < 9; press += 1) fireEvent.press(screen.getByLabelText("Decrease hour"));
    expect(screen.getByLabelText("Hour 12")).toBeTruthy();
    fireEvent.press(screen.getByText("Use time"));
    expect(screen.getByLabelText("Monday, interval 1 start, 12:00 AM")).toBeTruthy();
  });
});
