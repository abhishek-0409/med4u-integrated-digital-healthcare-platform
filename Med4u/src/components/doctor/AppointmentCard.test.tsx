import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Appointment } from "../../types/appointment";
import { AppointmentCard } from "./AppointmentCard";

jest.mock("./DoctorPortrait", () => ({ DoctorPortrait: () => null }));

const appointment = (status: Appointment["status"]): Appointment => ({
  id: "a1",
  status,
  type: "video",
  date: "2026-10-20",
  startTime: "10:00",
  endTime: "10:30",
  appointmentDate: "2026-10-20T04:30:00.000Z",
  timeZone: "Asia/Kolkata",
  consultationFee: 500,
  paymentStatus: "PAID",
  paymentReference: null,
  notes: null,
  cancellationReason: null,
  doctor: { id: "d1", name: "Dr. Asha Rao", specialization: "Cardiology", city: null, consultationFee: 500, consultationMode: "BOTH" },
  canJoin: false,
  canCancel: false,
  createdAt: "2026-10-01T00:00:00.000Z",
});

describe("AppointmentCard prescription action", () => {
  it("offers View prescription only for a completed consultation", () => {
    const onView = jest.fn();
    const { rerender } = render(<AppointmentCard appointment={appointment("completed")} onViewPrescription={onView} />);
    fireEvent.press(screen.getByText("View prescription"));
    expect(onView).toHaveBeenCalledTimes(1);

    for (const status of ["confirmed", "pending", "cancelled"] as const) {
      rerender(<AppointmentCard appointment={appointment(status)} onViewPrescription={onView} />);
      expect(screen.queryByText("View prescription")).toBeNull();
    }
  });
});
