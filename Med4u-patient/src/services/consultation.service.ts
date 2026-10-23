import { api } from "./api/client";

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

export const consultationService = {
  join(appointmentId: string): Promise<ConsultationCredentials> {
    return api.post<ConsultationCredentials>(
      `/v1/consultations/${encodeURIComponent(appointmentId)}/join`,
    );
  },
};
