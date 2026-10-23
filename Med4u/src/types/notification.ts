export type NotificationType =
  | "appointment_reminder"
  | "prescription_ready"
  | "prescription_issued"
  | "call_incoming"
  | "general"
  | string;

export interface PatientNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
}

export interface PatientNotificationPage {
  data: PatientNotification[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  unreadCount: number;
}
