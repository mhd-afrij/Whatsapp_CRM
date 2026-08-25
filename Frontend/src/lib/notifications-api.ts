import { apiClient, unwrap } from "@/lib/api-client";

export interface AppNotification {
  id: number;
  workspace_id: number;
  user_id: number;
  type: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationListMeta {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
  unread_count: number;
}

export interface NotificationListResult {
  data: AppNotification[];
  meta: NotificationListMeta;
}

export async function fetchNotifications(params: {
  unread?: boolean;
  page?: number;
  per_page?: number;
} = {}): Promise<NotificationListResult> {
  const response = await apiClient.get("/notifications", { params });
  return { data: response.data.data, meta: response.data.meta };
}

export async function markNotificationRead(id: number): Promise<AppNotification> {
  return unwrap(apiClient.patch(`/notifications/${id}/read`));
}

export async function markAllNotificationsRead(): Promise<{ updated: number }> {
  return unwrap(apiClient.post("/notifications/mark-all-read"));
}

export interface NotificationPreferenceRow {
  notification_type: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
}

export async function fetchNotificationPreferences(): Promise<NotificationPreferenceRow[]> {
  return unwrap(apiClient.get("/notification-preferences"));
}

export async function updateNotificationPreference(
  values: Partial<Pick<NotificationPreferenceRow, "in_app_enabled" | "email_enabled">> & {
    notification_type: string;
  }
): Promise<NotificationPreferenceRow> {
  return unwrap(apiClient.patch("/notification-preferences", values));
}

/**
 * Resolves the frontend route a notification of a given type should link to when clicked.
 * Kept as a plain function (not a hook) so it can be reused from both the dropdown and any
 * future notification list page.
 */
export function notificationLinkFor(notification: AppNotification): string | null {
  const data = notification.data ?? {};
  switch (notification.type) {
    case "conversation.assigned":
    case "conversation.new_message":
      return data.conversation_id ? `/inbox/${data.conversation_id}` : "/inbox";
    case "task.assigned":
    case "task.reminder":
    case "task.overdue":
    case "task.comment_mention":
      return "/tasks";
    case "note.mention":
      return data.deal_id ? `/deals/${data.deal_id}` : null;
    case "whatsapp.connection.failed":
    case "whatsapp.connection.reauth_required":
      return "/settings/whatsapp";
    default:
      return null;
  }
}

export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  "conversation.assigned": "Conversation assigned to you",
  "conversation.new_message": "New message on your conversation",
  "task.assigned": "Task assigned",
  "task.reminder": "Task reminder",
  "task.overdue": "Task overdue",
  "task.comment_mention": "Mentioned in a task comment",
  "note.mention": "Mentioned in a note",
  "whatsapp.connection.failed": "WhatsApp connection failed",
  "whatsapp.connection.reauth_required": "WhatsApp re-authentication required",
};
