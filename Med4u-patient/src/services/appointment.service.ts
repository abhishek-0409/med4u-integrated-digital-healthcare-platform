import { Paginated } from "../types/api";
import {
  Appointment,
  AppointmentListParams,
  CreateAppointmentRequest,
} from "../types/appointment";
import { api } from "./api/client";

export const appointmentService = {
  paymentConfiguration(): Promise<{ enabled: boolean; keyId?: string }> {
    return api.get("/v1/appointments/payment-configuration");
  },

  createPaymentOrder(request: CreateAppointmentRequest): Promise<{
    appointment: Appointment;
    keyId: string;
    orderId: string;
    amount: number;
    currency: string;
  }> {
    return api.post("/v1/appointments/payment-orders", request);
  },

  createDemoBooking(request: CreateAppointmentRequest): Promise<Appointment> {
    return api.post("/v1/appointments/demo-bookings", request);
  },

  verifyPayment(
    appointmentId: string,
    payload: {
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
    },
  ): Promise<Appointment> {
    return api.post(
      `/v1/appointments/${encodeURIComponent(appointmentId)}/verify-payment`,
      payload,
    );
  },

  cancelPaymentReservation(appointmentId: string): Promise<void> {
    return api.post(
      `/v1/appointments/${encodeURIComponent(appointmentId)}/cancel-payment`,
    );
  },

  get(appointmentId: string): Promise<Appointment> {
    return api.get<Appointment>(
      `/v1/appointments/${encodeURIComponent(appointmentId)}`,
    );
  },

  list(params: AppointmentListParams = {}): Promise<Paginated<Appointment>> {
    return api.getPage<Appointment>("/v1/appointments", { params });
  },

  cancel(appointmentId: string, reason?: string): Promise<Appointment> {
    return api.patch<Appointment>(
      `/v1/appointments/${encodeURIComponent(appointmentId)}/cancel`,
      reason ? { reason } : {},
    );
  },
};
