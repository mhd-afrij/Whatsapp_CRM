"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createWorkspaceWhatsappAccount,
  deleteWorkspaceWhatsappAccount,
  disableWorkspace,
  fetchWorkspaceSettings,
  transferWorkspaceOwnership,
  updateWorkspaceSettings,
  updateWorkspaceWhatsappAccount,
} from "@/lib/workspace-api";

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

export function useCreateWorkspaceWhatsappAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createWorkspaceWhatsappAccount,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKey }),
  });
}

export function useUpdateWorkspaceWhatsappAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: Parameters<typeof updateWorkspaceWhatsappAccount>[1] }) =>
      updateWorkspaceWhatsappAccount(id, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKey }),
  });
}

export function useDeleteWorkspaceWhatsappAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteWorkspaceWhatsappAccount,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKey }),
  });
}

export function useTransferWorkspaceOwnership() {
  return useMutation({ mutationFn: transferWorkspaceOwnership });
}

export function useDisableWorkspace() {
  return useMutation({ mutationFn: disableWorkspace });
}
