import { Doctor, DoctorDetail, DoctorListParams, TimeSlot } from "../types/doctor";
import { Paginated } from "../types/api";
import { api } from "./api/client";

export const doctorService = {
  list(params: DoctorListParams = {}): Promise<Paginated<Doctor>> {
    return api.getPage<Doctor>("/v1/doctors", { params });
  },

  getById(doctorId: string): Promise<DoctorDetail> {
    return api.get<DoctorDetail>(`/v1/doctors/${encodeURIComponent(doctorId)}`);
  },

  /** Distinct specializations of publicly listed doctors. */
  getSpecializations(): Promise<string[]> {
    return api.get<string[]>("/v1/doctors/specializations");
  },

  /** All slots for one clinic-local date ('YYYY-MM-DD'). */
  getAvailability(doctorId: string, date: string): Promise<TimeSlot[]> {
    return api.get<TimeSlot[]>(`/v1/doctors/${encodeURIComponent(doctorId)}/availability`, {
      params: { date },
    });
  },
};
