"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchInboxSettings,
  updateInboxSettings,
  type InboxSettings,
} from "@/lib/inbox-settings-api";

export const inboxSettingsKey = ["inbox-settings"] as const;

export function useInboxSettings() {
  return useQuery({
    queryKey: inboxSettingsKey,
    queryFn: fetchInboxSettings,
    placeholderData: (previous) => previous,
  });
}

export function useUpdateInboxSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: Partial<InboxSettings>) => updateInboxSettings(values),
    onSuccess: (result) => {
      queryClient.setQueryData(inboxSettingsKey, result);
    },
  });
}