"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWorkspaceSettings, updateWorkspaceSettings } from "@/lib/workspace-api";

const workspaceKey = ["workspace-settings"] as const;

export function useWorkspaceSettings() {
  return useQuery({ queryKey: workspaceKey, queryFn: fetchWorkspaceSettings });
}

export function useUpdateWorkspaceSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateWorkspaceSettings,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKey }),
  });
}
