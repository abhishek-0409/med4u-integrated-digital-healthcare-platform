import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { DashboardActions, DashboardView } from "./DashboardView";
import { buildDashboardModel } from "./dashboardModel";
import { DashboardResult } from "./loadDashboard";
import { ApiAppointment } from "../types/appointment";

const NOW = new Date("2026-10-17T04:30:00Z");
const base: ApiAppointment = {
  id: "a1", status: "confirmed", type: "video", date: "2026-10-17", startTime: "11:00:00", endTime: "11:30:00",
  timeZone: "Asia/Kolkata", notes: null, patient: { id: "p", name: "Aarav Mehta" }, canJoin: false, canCancel: true,
};

function actions(): DashboardActions {
  return {
    openAppointment: jest.fn(), joinAppointment: jest.fn(), openAppointments: jest.fn(), openAvailability: jest.fn(),
    openHistory: jest.fn(), openProfile: jest.fn(), retry: jest.fn(),
  };
}
function result(upcoming: ApiAppointment[], extra: Partial<DashboardResult> = {}): DashboardResult {
  return {
    appointments: { status: "ready", data: buildDashboardModel({ upcoming, upcomingTotal: upcoming.length, completed: [] }, NOW) },
    availability: { status: "ready", data: { acceptingToday: true, hoursToday: "9:00 AM – 5:00 PM", nextSlot: "12:00 PM" } },
    verified: false,
    avatarUrl: null,
    ...extra,
  };
}
function view(r: DashboardResult | null, a: DashboardActions, loading = false) {
  return render(<DashboardView doctorName="Dr. Priya Sharma" avatarUrl={null} loading={loading} result={r} actions={a} now={NOW} />);
}

describe("DashboardView", () => {
  it("shows a skeleton while loading and no fabricated numbers", () => {
    view(null, actions(), true);
    expect(screen.getByTestId("dashboard-skeleton")).toBeTruthy();
    expect(screen.queryByText("Today's appointments")).toBeNull();
  });

  it("shows an error with a working retry when appointments fail", () => {
    const a = actions();
    view({ ...result([]), appointments: { status: "error", message: "Could not connect." } }, a);
    expect(screen.getByText("Could not connect.")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Retry"));
    expect(a.retry).toHaveBeenCalled();
    expect(screen.queryByText("NEXT APPOINTMENT")).toBeNull();
  });

  it("shows empty states when there are no appointments", () => {
    view(result([]), actions());
    expect(screen.getByText("No upcoming appointments")).toBeTruthy();
    expect(screen.getByText("No appointments today")).toBeTruthy();
  });

  it("renders the next appointment and today's list from data", () => {
    const a = actions();
    view(result([base]), a);
    expect(screen.getByText("Good morning")).toBeTruthy();
    expect(screen.getAllByText("Aarav Mehta").length).toBe(2);
    fireEvent.press(screen.getByLabelText("View details for Aarav Mehta"));
    expect(a.openAppointment).toHaveBeenCalledWith("a1");
    fireEvent.press(screen.getByLabelText("View all appointments"));
    expect(a.openAppointments).toHaveBeenCalledWith("upcoming");
  });

  it("offers Join only when the backend confirms eligibility", () => {
    const notEligible = view(result([base]), actions());
    expect(screen.queryByLabelText("Join consultation with Aarav Mehta")).toBeNull();
    notEligible.unmount();

    const a = actions();
    view(result([{ ...base, canJoin: true }]), a);
    fireEvent.press(screen.getByLabelText("Join consultation with Aarav Mehta"));
    expect(a.joinAppointment).toHaveBeenCalledWith("a1");
  });

  it("does not offer Join for in-person appointments even if flagged", () => {
    view(result([{ ...base, type: "in_person", canJoin: true }]), actions());
    expect(screen.queryByLabelText("Join consultation with Aarav Mehta")).toBeNull();
  });

  it("shows the verified badge only when the backend confirms verification", () => {
    const unverified = view(result([]), actions());
    expect(screen.queryByLabelText("Verified doctor")).toBeNull();
    unverified.unmount();
    view(result([], { verified: true }), actions());
    expect(screen.getByLabelText("Verified doctor")).toBeTruthy();
  });

  it("wires every quick action and the schedule edit action", () => {
    const a = actions();
    view(result([]), a);
    fireEvent.press(screen.getByLabelText("Manage Availability"));
    fireEvent.press(screen.getByLabelText("Appointment Requests"));
    fireEvent.press(screen.getByLabelText("Patient History"));
    fireEvent.press(screen.getByLabelText("Prescriptions"));
    fireEvent.press(screen.getByLabelText("Edit schedule"));
    expect(a.openAvailability).toHaveBeenCalledTimes(2);
    expect(a.openAppointments).toHaveBeenCalledWith("pending");
    expect(a.openHistory).toHaveBeenCalledTimes(2);
  });

  it("degrades the availability card independently", () => {
    view({ ...result([base]), availability: { status: "error", message: "x" }, verified: null }, actions());
    expect(screen.getByText("Availability couldn't be loaded.")).toBeTruthy();
    expect(screen.getAllByText("Aarav Mehta").length).toBe(2);
  });
});
