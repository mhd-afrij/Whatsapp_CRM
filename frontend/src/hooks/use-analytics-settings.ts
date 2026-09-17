"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAnalyticsSettings,
  resetAnalyticsSettings,
  updateAnalyticsSettings,
  type AnalyticsSettings,
} from "@/lib/analytics-settings-api";

export const analyticsSettingsKey = ["analytics-settings"] as const;

export function useAnalyticsSettings() {
  return useQuery({
    queryKey: analyticsSettingsKey,
    queryFn: fetchAnalyticsSettings,
    placeholderData: (previous) => previous,
  });
}

export function useUpdateAnalyticsSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: Partial<AnalyticsSettings>) => updateAnalyticsSettings(values),
    onSuccess: (result) => queryClient.setQueryData(analyticsSettingsKey, result),
  });
}

export function useResetAnalyticsSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => resetAnalyticsSettings(),
    onSuccess: (result) => queryClient.setQueryData(analyticsSettingsKey, result),
  });
}
