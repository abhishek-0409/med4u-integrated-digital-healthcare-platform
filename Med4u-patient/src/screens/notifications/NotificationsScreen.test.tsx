import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

let mockFocusRefetch: (() => void) | null = null;
jest.mock("../../hooks/useRefreshOnFocus", () => ({
  useRefreshOnFocus: (refetch: () => void) => { mockFocusRefetch = refetch; },
}));
jest.mock("../../services/notification.service", () => ({
  notificationService: { list: jest.fn(), markRead: jest.fn(), unreadCount: jest.fn() },
}));

import { notificationService } from "../../services/notification.service";
import { PatientNotificationPage } from "../../types/notification";
import { NotificationsScreen } from "./NotificationsScreen";

const rxNotification = {
  id: "notice-1",
  type: "prescription_issued",
  title: "New prescription available",
  body: "Your doctor has issued a prescription. Tap to view it.",
  data: { prescriptionId: "rx-owned" },
  isRead: false,
  createdAt: "2026-10-23T12:00:00.000Z",
};
const page = (data: PatientNotificationPage["data"] = []) => ({ data, meta: { page: 1, limit: 50, total: data.length, totalPages: 1 }, unreadCount: data.filter((item) => !item.isRead).length });
const list = notificationService.list as jest.Mock;
const markRead = notificationService.markRead as jest.Mock;
const navigation = { navigate: jest.fn() };
const renderScreen = () => render(<NotificationsScreen navigation={navigation as never} route={{ key: "notice", name: "Notifications" } as never} />);

beforeEach(() => {
  jest.clearAllMocks();
  mockFocusRefetch = null;
  markRead.mockResolvedValue({ id: "notice-1", isRead: true });
});

describe("NotificationsScreen", () => {
  it("shows prescription notification content, timestamp, and unread state", async () => {
    list.mockResolvedValue(page([rxNotification]));
    renderScreen();
    expect(await screen.findByText("New prescription available")).toBeTruthy();
    expect(screen.getByText("Your doctor has issued a prescription. Tap to view it.")).toBeTruthy();
    expect(screen.getByText("1 unread")).toBeTruthy();
    expect(screen.getByText("Unread")).toBeTruthy();
    expect(screen.getByText(/2026/)).toBeTruthy();
    expect(screen.getAllByLabelText(/Unread/).length).toBeGreaterThan(0);
  });

  it("marks the notification read and opens its prescription detail route", async () => {
    list.mockResolvedValue(page([rxNotification]));
    renderScreen();
    const title = await screen.findByText("New prescription available");
    await act(async () => {
      fireEvent.press(title);
    });
    expect(markRead).toHaveBeenCalledWith("notice-1");
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith("PrescriptionDetail", { prescriptionId: "rx-owned" }));
  });

  it("keeps existing appointment and general notification types visible", async () => {
    list.mockResolvedValue(page([
      { ...rxNotification, id: "notice-2", type: "appointment_reminder", title: "Appointment reminder", isRead: true, data: null },
      { ...rxNotification, id: "notice-3", type: "general", title: "Account update", isRead: true, data: null },
    ]));
    renderScreen();
    expect(await screen.findByText("Appointment reminder")).toBeTruthy();
    expect(screen.getByText("Account update")).toBeTruthy();
    expect(screen.getAllByText("Read")).toHaveLength(2);
  });

  it("shows loading, empty, and retryable error states", async () => {
    list.mockReturnValueOnce(new Promise(() => undefined));
    renderScreen();
    expect(screen.getByText("Loading notifications…")).toBeTruthy();
  });

  it("shows an empty state only after a successful empty response", async () => {
    list.mockResolvedValue(page([]));
    renderScreen();
    expect(await screen.findByText("No notifications yet")).toBeTruthy();
  });

  it("shows a retry after an API error and refreshes when focus returns", async () => {
    list.mockRejectedValueOnce(new Error("offline"));
    renderScreen();
    expect(await screen.findByText("Couldn't load notifications")).toBeTruthy();
    list.mockResolvedValueOnce(page([rxNotification]));
    fireEvent.press(screen.getByText("Try again"));
    expect(await screen.findByText("New prescription available")).toBeTruthy();
    list.mockResolvedValueOnce(page([{ ...rxNotification, isRead: true }]));
    await act(async () => { mockFocusRefetch?.(); });
    expect(list).toHaveBeenCalledTimes(3);
  });
});
