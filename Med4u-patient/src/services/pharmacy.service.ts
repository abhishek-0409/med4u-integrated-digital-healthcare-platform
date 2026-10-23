import { Paginated } from "../types/api";
import { OrderStatus, PrescriptionRejectionReason, PrescriptionReviewStatus } from "../types/order";
import { ReviewQueueItem, StaffOrder } from "../types/pharmacy";
import { api } from "./api/client";

const enc = encodeURIComponent;

/** Pharmacist/admin back office. Every call is authorized by the server; hiding screens is not the control. */
export const pharmacyService = {
  prescriptions(params: { status?: PrescriptionReviewStatus; page?: number; limit?: number }): Promise<Paginated<ReviewQueueItem>> {
    return api.getPage<ReviewQueueItem>("/v1/pharmacy/prescriptions", { params });
  },
  prescription(id: string): Promise<ReviewQueueItem> {
    return api.get<ReviewQueueItem>(`/v1/pharmacy/prescriptions/${enc(id)}`);
  },
  approve(id: string): Promise<ReviewQueueItem> {
    return api.post<ReviewQueueItem>(`/v1/pharmacy/prescriptions/${enc(id)}/approve`, {});
  },
  reject(id: string, reason: PrescriptionRejectionReason, note?: string): Promise<ReviewQueueItem> {
    return api.post<ReviewQueueItem>(`/v1/pharmacy/prescriptions/${enc(id)}/reject`, { reason, ...(note ? { note } : {}) });
  },
  /** The decrypted prescription as bytes + content type (owner or staff only). */
  file(id: string) {
    return api.getBinary(`/v1/prescription-uploads/${enc(id)}/file`);
  },

  orders(params: { status?: OrderStatus; page?: number; limit?: number }): Promise<Paginated<StaffOrder>> {
    return api.getPage<StaffOrder>("/v1/pharmacy/orders", { params });
  },
  order(id: string): Promise<StaffOrder> {
    return api.get<StaffOrder>(`/v1/pharmacy/orders/${enc(id)}`);
  },
  updateStatus(id: string, status: OrderStatus, note?: string): Promise<StaffOrder> {
    return api.patch<StaffOrder>(`/v1/pharmacy/orders/${enc(id)}/status`, { status, ...(note ? { note } : {}) });
  },
};
