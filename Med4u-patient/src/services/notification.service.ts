import { api } from './api/client';
import { PatientNotificationPage } from '../types/notification';

/** All methods use the active authenticated session; no user or patient id is sent by the client. */
export const notificationService = {
  list(page = 1, limit = 50): Promise<PatientNotificationPage> {
    return api.get('/v1/patient/notifications', { params: { page, limit } });
  },

  unreadCount(): Promise<{ unreadCount: number }> {
    return api.get('/v1/patient/notifications/unread-count');
  },

  markRead(id: string): Promise<{ id: string; isRead: true }> {
    return api.patch(`/v1/patient/notifications/${encodeURIComponent(id)}/read`);
  },
};
