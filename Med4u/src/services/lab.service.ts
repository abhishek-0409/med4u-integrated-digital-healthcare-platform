import { api } from './api/client';
import { LabBooking, LabTest } from '../types/lab';

export interface CreateLabBooking {
  testId: string; preferredDate: string; preferredTime: string; homeCollection: boolean;
  contactName: string; contactPhone: string;
  address?: { line1: string; line2?: string; city: string; state: string; pincode: string };
}
export const labService = {
  catalog: () => api.get<LabTest[]>('/v1/lab-tests'),
  bookings: () => api.get<LabBooking[]>('/v1/lab-tests/bookings'),
  getBooking: (id: string) => api.get<LabBooking>(`/v1/lab-tests/bookings/${encodeURIComponent(id)}`),
  book: (request: CreateLabBooking) => api.post<LabBooking>('/v1/lab-tests/bookings', request),
  cancel: (id: string) => api.patch<LabBooking>(`/v1/lab-tests/bookings/${encodeURIComponent(id)}/cancel`),
};
