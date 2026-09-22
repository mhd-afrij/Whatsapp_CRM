"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  downloadReportExport,
  fetchReportExports,
  fetchReportOverview,
  fetchReportSettings,
  queueReportExport,
  resetReportSettings,
  retryReportExport,
  updateReportSettings,
  type ReportExportType,
  type ReportFilters,
  type ReportPreferences,
} from "@/lib/reports-api";

export const reportOverviewKey = (filters: ReportFilters) => ["reports", "overview", filters] as const;
export const reportSettingsKey = ["reports", "settings"] as const;
export const reportExportsKey = ["reports", "exports"] as const;

export function useReportOverview(filters: ReportFilters) {
  return useQuery({
    queryKey: reportOverviewKey(filters),
    queryFn: () => fetchReportOverview(filters),
    // Backend caches overview for 30s; keep the client from refetching harder than it.
    staleTime: 25_000,
    placeholderData: (previous) => previous,
  });
}

export function useReportSettings() {
  return useQuery({
    queryKey: reportSettingsKey,
    queryFn: fetchReportSettings,
    placeholderData: (previous) => previous,
  });
}

export function useUpdateReportPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: Partial<ReportPreferences>) => updateReportSettings(values),
    onSuccess: (result) => queryClient.setQueryData(reportSettingsKey, result),
  });
}

export function useResetReportPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => resetReportSettings(),
    onSuccess: (result) => queryClient.setQueryData(reportSettingsKey, result),
  });
}

export function useReportExports() {
  return useQuery({
    queryKey: reportExportsKey,
    queryFn: fetchReportExports,
    refetchInterval: (query) => {
      const items = query.state.data ?? [];
      const hasPending = items.some((item) => item.status === "queued" || item.status === "processing");
      return hasPending ? 4_000 : false;
    },
  });
}

/** Queue a report export; successful generation changes the exports list. */
export function useQueueReportExport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (type: ReportExportType) => queueReportExport(type),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reportExportsKey }),
  });
}

export function useRetryReportExport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => retryReportExport(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reportExportsKey }),
  });
}

export function useDownloadReportExport() {
  return useMutation({
    mutationFn: ({ id }: { id: number; fileName: string }) => downloadReportExport(id),
    onSuccess: (blob, { fileName }) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    },
  });
}