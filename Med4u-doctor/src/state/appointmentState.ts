import { MOCK_APPOINTMENTS } from "../data/mockData";
import { DoctorAppointment } from "../types/appointment";

/** UI preview state only. Replace the provider with authenticated API state in the integration phase. */
export const appointmentState = {
  all(): DoctorAppointment[] {
    return MOCK_APPOINTMENTS;
  },
  today(): DoctorAppointment[] {
    return MOCK_APPOINTMENTS.filter((appointment) => appointment.date === "Today");
  },
  upcoming(): DoctorAppointment[] {
    return MOCK_APPOINTMENTS.filter((appointment) => appointment.date !== "Today");
  },
  pending(): DoctorAppointment[] {
    return MOCK_APPOINTMENTS.filter((appointment) => appointment.status === "pending");
  },
  byId(id: string): DoctorAppointment | undefined {
    return MOCK_APPOINTMENTS.find((appointment) => appointment.id === id);
  },
};
