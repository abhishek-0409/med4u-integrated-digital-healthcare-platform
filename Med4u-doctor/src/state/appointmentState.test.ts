import { appointmentState } from "./appointmentState";

describe("appointment preview state", () => {
  it("separates today's appointments from upcoming appointments", () => {
    expect(appointmentState.today()).toHaveLength(3);
    expect(appointmentState.upcoming()).toHaveLength(2);
    expect(appointmentState.today().every((item) => item.date === "Today")).toBe(true);
  });

  it("returns pending appointments and looks up appointments by id", () => {
    expect(appointmentState.pending()).toHaveLength(2);
    expect(appointmentState.byId("demo-appt-001")?.patientName).toBe("Aarav Mehta");
    expect(appointmentState.byId("missing")).toBeUndefined();
  });
});
