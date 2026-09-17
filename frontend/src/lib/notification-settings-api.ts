import { apiClient, unwrap } from "@/lib/api-client";
import type { NotificationPreferenceRow } from "@/lib/notifications-api";

export interface NotificationQuietHours {
  enabled: boolean;
  start: string;
  end: string;
  timezone: string;
  allow_critical: boolean;
}

export interface NotificationGlobalSettings {
  email_enabled: boolean;
  email_digest: "immediately" | "hourly" | "daily" | "never";
  digest_time: string;
  quiet_hours: NotificationQuietHours;
  in_app_sound: boolean;
  browser_notifications: boolean;
  show_unread_badge: boolean;
  auto_mark_read: boolean;
}

export interface NotificationSettingsResult {
  preferences: NotificationPreferenceRow[];
  global: NotificationGlobalSettings;
}

export async function fetchNotificationSettings(): Promise<NotificationSettingsResult> {
  return unwrap(apiClient.get("/settings/notifications"));
}

export async function updateNotificationSettings(payload: {
  preferences?: Array<
    Partial<Pick<NotificationPreferenceRow, "in_app_enabled" | "email_enabled">> & {
      notification_type: string;
    }
  >;
  global?: Partial<NotificationGlobalSettings>;
}): Promise<NotificationSettingsResult> {
  return unwrap(apiClient.patch("/settings/notifications", payload));
}

export async function updateNotificationSettingOne(
  notificationType: string,
  values: Partial<Pick<NotificationPreferenceRow, "in_app_enabled" | "email_enabled">>
): Promise<NotificationPreferenceRow> {
  return unwrap(apiClient.patch(`/settings/notifications/${notificationType}`, values));
}