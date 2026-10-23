import { doctorApi } from "../api/client";
import { ApiAppointment, ApiDoctorDetail, ApiTimeSlot } from "../types/appointment";

export interface AppointmentPage { items: ApiAppointment[]; total: number }

export const appointmentApi = {
  /** Doctor-scoped by the server (JWT subject). `scope=upcoming` is live appointments that have not ended, soonest first. */
  list: (params: { scope?: "upcoming" | "past"; status?: ApiAppointment["status"]; limit?: number; page?: number }): Promise<AppointmentPage> =>
    doctorApi.getPage<ApiAppointment>("/api/v1/appointments", { params }),
  get: (id: string) => doctorApi.get<ApiAppointment>(`/api/v1/appointments/${encodeURIComponent(id)}`),
};

export const doctorProfileApi = {
  detail: (doctorId: string) => doctorApi.get<ApiDoctorDetail>(`/api/v1/doctors/${encodeURIComponent(doctorId)}`),
  self: () => doctorApi.get<import("../types/auth").DoctorIdentity>("/api/v1/doctors/me"),
  saveAvailability: (availabilitySchedule: ApiDoctorDetail["availabilitySchedule"]) =>
    doctorApi.patch<ApiDoctorDetail>("/api/v1/doctors/me", { availabilitySchedule }),
  slots: (doctorId: string, date: string) =>
    doctorApi.get<ApiTimeSlot[]>(`/api/v1/doctors/${encodeURIComponent(doctorId)}/availability`, { params: { date } }),
};
