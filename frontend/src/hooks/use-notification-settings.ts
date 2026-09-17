"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchNotificationSettings,
  updateNotificationSettingOne,
  updateNotificationSettings,
  type NotificationSettingsResult,
} from "@/lib/notification-settings-api";
import type { NotificationPreferenceRow } from "@/lib/notifications-api";

export const notificationSettingsKey = ["notification-settings"] as const;

export function useNotificationSettings() {
  return useQuery({
    queryKey: notificationSettingsKey,
    queryFn: fetchNotificationSettings,
  });
}

/**
 * Per-toggle save for a single trigger type with optimistic UI (flip
 * immediately, roll back on failure). Keeps the settings screen feeling
 * instant instead of waiting on the network per switch.
 */
export function useUpdateNotificationSettingOne() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      notificationType,
      values,
    }: {
      notificationType: string;
      values: Partial<Pick<NotificationPreferenceRow, "in_app_enabled" | "email_enabled">>;
    }) => updateNotificationSettingOne(notificationType, values),
    onMutate: async ({ notificationType, values }) => {
      await queryClient.cancelQueries({ queryKey: notificationSettingsKey });
      const previous = queryClient.getQueryData<NotificationSettingsResult>(notificationSettingsKey);

      queryClient.setQueryData<NotificationSettingsResult | undefined>(
        notificationSettingsKey,
        (current) =>
          current
            ? {
                ...current,
                preferences: current.preferences.map((row) =>
                  row.notification_type === notificationType ? { ...row, ...values } : row
                ),
              }
            : current
      );

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationSettingsKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationSettingsKey });
    },
  });
}

/**
 * Bulk save for the global delivery section (email digest, quiet hours, in-app
 * behavior). Not optimistic - large forms, so it waits for the server.
 */
export function useSaveNotificationSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof updateNotificationSettings>[0]) =>
      updateNotificationSettings(payload),
    onSuccess: (result) => {
      queryClient.setQueryData(notificationSettingsKey, result);
    },
  });
}

/** Applies on/off to every trigger type at once (Enable All / Disable All). */
export function useBulkNotificationPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: { inApp: boolean; email: boolean }) => {
      const current = queryClient.getQueryData<NotificationSettingsResult>(notificationSettingsKey);
      const preferences =
        current?.preferences.map((row) => ({
          notification_type: row.notification_type,
          in_app_enabled: values.inApp,
          email_enabled: values.email,
        })) ?? [];

      return updateNotificationSettings({ preferences });
    },
    onMutate: async ({ inApp, email }) => {
      await queryClient.cancelQueries({ queryKey: notificationSettingsKey });
      const previous = queryClient.getQueryData<NotificationSettingsResult>(notificationSettingsKey);

      queryClient.setQueryData<NotificationSettingsResult | undefined>(
        notificationSettingsKey,
        (current) =>
          current
            ? {
                ...current,
                preferences: current.preferences.map((row) => ({
                  ...row,
                  in_app_enabled: inApp,
                  email_enabled: email,
                })),
              }
            : current
      );

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationSettingsKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationSettingsKey });
    },
  });
}