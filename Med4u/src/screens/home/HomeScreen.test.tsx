import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

let mockFocusRefetches: Array<() => void> = [];
jest.mock("../../hooks/useRefreshOnFocus", () => ({
  useRefreshOnFocus: (refetch: () => void) => { mockFocusRefetches.push(refetch); },
}));
jest.mock("../../services/appointment.service", () => ({ appointmentService: { list: jest.fn() } }));
jest.mock("../../services/doctor.service", () => ({ doctorService: { list: jest.fn() } }));
jest.mock("../../services/notification.service", () => ({ notificationService: { unreadCount: jest.fn() } }));
jest.mock("../../hooks/useAuth", () => ({ useAuth: () => ({ user: { name: "Mira Patient", phone: "123", avatarUrl: null } }) }));
jest.mock("../../components/doctor/DoctorPortrait", () => ({ DoctorPortrait: () => null }));

import { appointmentService } from "../../services/appointment.service";
import { doctorService } from "../../services/doctor.service";
import { notificationService } from "../../services/notification.service";
import { Appointment } from "../../types/appointment";
import { HomeScreen } from "./HomeScreen";

const appointment = (overrides: Partial<Appointment> = {}): Appointment => ({
  id: "apt-1",
  status: "confirmed",
  type: "video",
  date: "2026-10-24",
  startTime: "10:00",
  endTime: "10:30",
  appointmentDate: "2026-10-24T04:30:00.000Z",
  timeZone: "Asia/Kolkata",
  consultationFee: 500,
  paymentStatus: "PAID",
  paymentReference: "pay-1",
  notes: null,
  cancellationReason: null,
  doctor: { id: "doc-1", name: "Dr. Asha Rao", specialization: "Cardiology", city: "Pune", consultationFee: 500, consultationMode: "BOTH" },
  canJoin: false,
  canCancel: true,
  createdAt: "2026-10-20T10:00:00.000Z",
  ...overrides,
});
const page = (items: Appointment[]) => ({ items, meta: { page: 1, limit: 50, total: items.length, totalPages: 1 } });
const listAppointments = appointmentService.list as jest.Mock;
const navigation = { navigate: jest.fn() };
const wrap = () => render(
  <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
    <HomeScreen navigation={navigation as never} route={{ key: "home", name: "Home" } as never} />
  </SafeAreaProvider>,
);

beforeEach(() => {
  jest.clearAllMocks();
  mockFocusRefetches = [];
  (doctorService.list as jest.Mock).mockReturnValue(new Promise(() => undefined));
  (notificationService.unreadCount as jest.Mock).mockReturnValue(new Promise(() => undefined));
});

describe("HomeScreen appointment banner", () => {
  it("shows a compact loading state without falling back to the promotion", () => {
    listAppointments.mockReturnValue(new Promise(() => undefined));
    wrap();
    expect(screen.getByLabelText("Loading appointments")).toBeTruthy();
    expect(screen.queryByText("Consult top doctors")).toBeNull();
  });

  it("shows the existing promotion only after the API confirms there are no upcoming appointments", async () => {
    listAppointments.mockResolvedValue(page([]));
    wrap();
    expect(await screen.findByText("Consult top doctors")).toBeTruthy();
    expect(screen.getByText("CARE THAT COMES TO YOU")).toBeTruthy();
    expect(screen.getByText("Online or in person, expert care starts here.")).toBeTruthy();
    expect(screen.getByText("Book Appointment")).toBeTruthy();
  });

  it("shows the unread notification count and opens the notification screen", async () => {
    listAppointments.mockResolvedValue(page([]));
    (notificationService.unreadCount as jest.Mock).mockResolvedValue({ unreadCount: 3 });
    wrap();
    const notifications = await screen.findByLabelText("Notifications, 3 unread");
    expect(notifications).toBeTruthy();
    fireEvent.press(notifications);
    expect(navigation.navigate).toHaveBeenCalledWith("Notifications");
  });

  it("shows appointment details instead of the promotion and opens appointment details", async () => {
    listAppointments.mockResolvedValue(page([appointment()]));
    wrap();
    expect(await screen.findByText("UPCOMING APPOINTMENT")).toBeTruthy();
    expect(screen.getByText("Dr. Asha Rao")).toBeTruthy();
    expect(screen.getByText("Cardiology")).toBeTruthy();
    expect(screen.getByText("Sat, 24 Oct 2026 · 10:00 AM")).toBeTruthy();
    expect(screen.getByText("Video")).toBeTruthy();
    expect(screen.queryByText("Consult top doctors")).toBeNull();
    fireEvent.press(screen.getByText("View Appointment"));
    expect(navigation.navigate).toHaveBeenCalledWith("AppointmentConfirmation", { appointmentId: "apt-1" });
    fireEvent.press(screen.getByLabelText("View all appointments"));
    expect(navigation.navigate).toHaveBeenCalledWith("Appointments");
  });

  it("routes to video consultation only when the server's canJoin flag is true", async () => {
    listAppointments.mockResolvedValue(page([appointment({ canJoin: true })]));
    wrap();
    fireEvent.press(await screen.findByText("Join Consultation"));
    expect(navigation.navigate).toHaveBeenCalledWith("VideoConsult", { appointmentId: "apt-1" });
  });

  it("shows View Appointment for pending payment/confirmation", async () => {
    listAppointments.mockResolvedValue(page([appointment({ status: "pending", paymentStatus: "PENDING", canJoin: true })]));
    wrap();
    expect(await screen.findByText("Payment pending")).toBeTruthy();
    expect(screen.getByText("View Appointment")).toBeTruthy();
    expect(screen.queryByText("Join Consultation")).toBeNull();
  });

  it("shows View Appointment while a booking awaits confirmation", async () => {
    listAppointments.mockResolvedValue(page([appointment({ status: "pending", paymentStatus: "PAID" })]));
    wrap();
    expect(await screen.findByText("Awaiting confirmation")).toBeTruthy();
    expect(screen.getByText("View Appointment")).toBeTruthy();
    expect(screen.queryByText("Join Consultation")).toBeNull();
  });

  it("shows retry on API failure and does not display the promotion", async () => {
    listAppointments.mockRejectedValueOnce(new Error("offline"));
    wrap();
    expect(await screen.findByText("Appointments unavailable")).toBeTruthy();
    expect(screen.queryByText("Consult top doctors")).toBeNull();
    listAppointments.mockResolvedValueOnce(page([]));
    fireEvent.press(screen.getByText("Retry"));
    expect(await screen.findByText("Consult top doctors")).toBeTruthy();
  });

  it("refreshes appointments when focus returns after booking or consultation", async () => {
    listAppointments.mockResolvedValueOnce(page([])).mockResolvedValueOnce(page([appointment()]));
    wrap();
    expect(await screen.findByText("Consult top doctors")).toBeTruthy();
    await act(async () => { mockFocusRefetches.forEach((refetch) => refetch()); });
    expect(await screen.findByText("UPCOMING APPOINTMENT")).toBeTruthy();
    expect(listAppointments).toHaveBeenCalledTimes(2);
    expect(notificationService.unreadCount).toHaveBeenCalledTimes(2);
  });
});
