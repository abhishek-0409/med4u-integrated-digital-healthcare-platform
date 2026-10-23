import { LoginResult } from "../types/auth";
import { AxiosRequestConfig } from "axios";
import { api } from "./api/client";

export const authService = {
  /** Asks the backend to SMS a one-time code. `phone` must be E.164. */
  async requestOtp(phone: string): Promise<void> {
    await api.post<{ message: string }>("/v1/auth/send-otp", { phone }, { skipAuth: true });
  },

  verifyOtp(phone: string, otp: string): Promise<LoginResult> {
    return api.post<LoginResult>("/v1/auth/verify-otp", { phone, otp }, { skipAuth: true });
  },

  async logout(config?: AxiosRequestConfig): Promise<void> {
    await api.post<void>("/v1/auth/logout", undefined, config);
  },
};
