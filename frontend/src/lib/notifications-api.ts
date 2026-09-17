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
    // The tasks module pages were removed, so task notifications have no
    // detail page to open; they stay visible in the feed but resolve to null.
    case "task.assigned":
    case "task.reminder":
    case "task.overdue":
    case "task.comment_mention":
      return null;
    case "note.mention":
      return data.deal_id ? `/deals/${data.deal_id}` : null;
    case "whatsapp.connection.failed":
    case "whatsapp.connection.reauth_required":
      return "/settings/workspace/whatsapp";
    default:
      return null;
  }
}

export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  "conversation.assigned": "Conversation assigned to you",
  "conversation.new_message": "New message on your conversation",
  "conversation.reassigned": "A conversation you handled was reassigned",
  "conversation.reopened": "A closed conversation was reopened",
  "task.assigned": "Task assigned",
  "task.reminder": "Task reminder",
  "calendar_event.reminder": "Calendar event reminder",
  "task.overdue": "Task overdue",
  "task.comment_mention": "Mentioned in a task comment",
  "note.mention": "Mentioned in a note",
  "lead.assigned": "Lead assigned to you",
  "lead.status_changed": "A lead you own changed status",
  "deal.assigned": "Deal assigned to you",
  "deal.stage_changed": "A deal you own moved stage",
  "deal.won": "A deal you own was won",
  "deal.lost": "A deal you own was lost",
  "whatsapp.connection.failed": "WhatsApp connection failed",
  "whatsapp.connection.reauth_required": "WhatsApp re-authentication required",
  "whatsapp.reconnected": "WhatsApp connection re-established",
  "whatsapp.qr_required": "WhatsApp QR code needs re-scanning",
  "import.completed": "A contact import finished",
  "export.completed": "A contact export finished",
  "sla.warning": "A conversation is close to breaching SLA",
  "sla.breached": "A conversation breached SLA",
};

export interface NotificationCategory {
  key: string;
  label: string;
  types: string[];
}

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  {
    key: "conversations",
    label: "Conversations",
    types: [
      "conversation.assigned",
      "conversation.new_message",
      "conversation.reassigned",
      "conversation.reopened",
    ],
  },
  {
    key: "tasks",
    label: "Tasks & notes",
    types: ["task.assigned", "task.reminder", "task.overdue", "task.comment_mention", "note.mention"],
  },
  {
    key: "deals",
    label: "Deals & leads",
    types: [
      "lead.assigned",
      "lead.status_changed",
      "deal.assigned",
      "deal.stage_changed",
      "deal.won",
      "deal.lost",
    ],
  },
  {
    key: "whatsapp",
    label: "WhatsApp connection",
    types: [
      "whatsapp.connection.failed",
      "whatsapp.connection.reauth_required",
      "whatsapp.reconnected",
      "whatsapp.qr_required",
    ],
  },
  {
    key: "tools",
    label: "Imports & exports",
    types: ["import.completed", "export.completed"],
  },
  {
    key: "sla",
    label: "SLA",
    types: ["sla.warning", "sla.breached"],
  },
];

export function notificationCategoryFor(type: string): string {
  return NOTIFICATION_CATEGORIES.find((cat) => cat.types.includes(type))?.label ?? "Other";
}
