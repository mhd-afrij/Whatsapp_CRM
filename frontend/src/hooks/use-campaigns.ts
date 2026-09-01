"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelCampaign,
  createCampaign,
  deleteCampaign,
  fetchCampaign,
  fetchCampaignAnalytics,
  fetchCampaignMessages,
  fetchCampaigns,
  previewCampaignAudience,
  sendCampaign,
  updateCampaign,
  type CampaignAnalytics,
  type CampaignFormValues,
  type CampaignMessageRow,
  type CampaignStatus,
} from "@/lib/campaigns-api";

export const campaignsKey = ["campaigns"] as const;

export function useCampaigns(params?: { status?: CampaignStatus; search?: string }) {
  return useQuery({
    queryKey: [...campaignsKey, params],
    queryFn: () => fetchCampaigns(params),
  });
}

export function useCampaign(id: number | null) {
  return useQuery({
    queryKey: [...campaignsKey, "detail", id],
    queryFn: () => fetchCampaign(id as number),
    enabled: id != null,
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: CampaignFormValues) => createCampaign(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: campaignsKey }),
  });
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: Partial<CampaignFormValues> }) =>
      updateCampaign(id, values),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: campaignsKey });
      queryClient.invalidateQueries({
        queryKey: [...campaignsKey, "detail", variables.id],
      });
    },
  });
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteCampaign(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: campaignsKey }),
  });
}

/** Send now / resume a completed-with-failures campaign. */
export function useSendCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => sendCampaign(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: campaignsKey }),
  });
}

export function useCancelCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => cancelCampaign(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: campaignsKey }),
  });
}

/**
 * Audience preview for the wizard. Enabled only when requested so the
 * preview request fires on explicit user action (button), not every keystroke.
 */
export function useAudiencePreview(filter: { labels: number[]; statuses: string[]; search?: string } | null) {
  return useQuery({
    queryKey: ["campaign-audience-preview", filter],
    queryFn: () => previewCampaignAudience(filter as NonNullable<typeof filter>),
    enabled: filter != null,
  });
}

export function useCampaignAnalytics(id: number | null, options?: { refetchWhileSending?: boolean }) {
  return useQuery<CampaignAnalytics>({
    queryKey: [...campaignsKey, "analytics", id],
    queryFn: () => fetchCampaignAnalytics(id as number),
    enabled: id != null,
    refetchInterval: options?.refetchWhileSending ? 4000 : false,
  });
}

export function useCampaignMessages(params: {
  id: number | null;
  status?: string;
  search?: string;
  refetchWhileSending?: boolean;
}) {
  const { id, status, search, refetchWhileSending } = params;
  return useQuery<CampaignMessageRow[]>({
    queryKey: [...campaignsKey, "messages", id, status, search],
    queryFn: () =>
      fetchCampaignMessages({
        id: id as number,
        ...(status ? { status } : {}),
        ...(search ? { search } : {}),
      }),
    enabled: id != null,
    refetchInterval: refetchWhileSending ? 4000 : false,
  });
}
