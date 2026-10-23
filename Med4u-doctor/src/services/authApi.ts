import { doctorApi } from "../api/client";
import { DoctorIdentity, LoginResult, UserProfile } from "../types/auth";

export const authApi = {
  sendOtp: (phone: string) => doctorApi.post<{ message: string }>("/api/v1/auth/send-otp", { phone }, { skipAuth: true }),
  verifyOtp: (phone: string, otp: string) => doctorApi.post<LoginResult>("/api/v1/auth/verify-otp", { phone, otp }, { skipAuth: true }),
  currentUser: () => doctorApi.get<UserProfile>("/api/v1/users/me"),
  // This self-scoped endpoint is required for safe linking; it is absent in current backend.
  currentDoctor: () => doctorApi.get<DoctorIdentity>("/api/v1/doctors/me"),
  revokeSession: async () => { await doctorApi.post<void>("/api/v1/auth/logout"); },
  setTransientTokens: (tokens: Parameters<typeof doctorApi.setTransientTokens>[0]) => doctorApi.setTransientTokens(tokens),
  persistTransientSession: () => doctorApi.persistTransientSession(),
};
