import { doctorApi } from "../api/client";

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface ConsultationCredentials {
  roomId: string;
  token: string;
  stunServers: IceServer[];
  turnServers: IceServer[];
}

export const consultationApi = {
  join: (appointmentId: string) =>
    doctorApi.post<ConsultationCredentials>(
      `/api/v1/consultations/${encodeURIComponent(appointmentId)}/join`,
    ),
};
