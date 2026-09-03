"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchSlaConfigs,
  createSlaConfig,
  updateSlaConfig,
  deleteSlaConfig,
  fetchConversationSlaStatus,
  type SlaConfig,
} from "@/lib/sla-api";

export const slaConfigsKey = ["sla-configs"] as const;

export function useSlaConfigs() {
  return useQuery({
    queryKey: slaConfigsKey,
    queryFn: fetchSlaConfigs,
  });
}

export function useCreateSlaConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: { name: string; first_response_minutes: number; followup_response_minutes: number }) =>
      createSlaConfig(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: slaConfigsKey }),
  });
}

export function useUpdateSlaConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: Partial<SlaConfig> }) =>
      updateSlaConfig(id, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: slaConfigsKey }),
  });
}

export function useDeleteSlaConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteSlaConfig(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: slaConfigsKey }),
  });
}

export function useConversationSlaStatus(conversationId: number | null) {
  return useQuery({
    queryKey: ["conversations", conversationId, "sla"],
    queryFn: () => fetchConversationSlaStatus(conversationId as number),
    enabled: !!conversationId,
    refetchInterval: 30_000, // Check every 30 seconds
  });
}
