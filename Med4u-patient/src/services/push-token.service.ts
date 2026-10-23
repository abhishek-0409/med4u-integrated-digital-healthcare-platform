import { api } from "./api/client";

export const pushTokenService = {
  register: (token: string, deviceId: string) => api.post<void>("/v1/patient/prescriptions/push-token", { token, deviceId }),
  remove: (deviceId: string) => api.delete<void>(`/v1/patient/prescriptions/push-token/${encodeURIComponent(deviceId)}`),
};
