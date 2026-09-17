"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import {
  connectWhatsappAccount,
  createWhatsappAccount,
  deleteWhatsappAccount,
  disconnectWhatsappAccount,
  fetchWhatsappAccountConnectionStatus,
  fetchWhatsappAccountQr,
  fetchWhatsappAccounts,
  reconnectWhatsappAccount,
  setActiveForceWhatsappAccount,
  setActiveWhatsappAccount,
  updateWhatsappAccount,
  type UpdateWhatsappAccountValues,
  type WhatsappAccount,
} from "@/lib/whatsapp-accounts-api";
import { WHATSAPP_STATUS_KEY } from "@/hooks/use-whatsapp-connection";

export const WHATSAPP_ACCOUNTS_KEY = ["whatsapp", "accounts"] as const;

export function useWhatsappAccounts(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  return useQuery({
    queryKey: WHATSAPP_ACCOUNTS_KEY,
    queryFn: fetchWhatsappAccounts,
    staleTime: 5_000,
    enabled,
  });
}

/**
 * Shared invalidation: account list + live connection status (an account
 * change can change which slot is mapped to the real gateway session).
 */
function useInvalidateAccounts() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: WHATSAPP_ACCOUNTS_KEY });
    queryClient.invalidateQueries({ queryKey: WHATSAPP_STATUS_KEY });
    void queryClient.refetchQueries({ queryKey: WHATSAPP_ACCOUNTS_KEY });
    void queryClient.refetchQueries({ queryKey: WHATSAPP_STATUS_KEY });
  };
}

export function useCreateWhatsappAccount() {
  const invalidate = useInvalidateAccounts();
  return useMutation({
    mutationFn: createWhatsappAccount,
    onSuccess: invalidate,
  });
}

export function useUpdateWhatsappAccount() {
  const invalidate = useInvalidateAccounts();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: UpdateWhatsappAccountValues }) =>
      updateWhatsappAccount(id, values),
    onSuccess: invalidate,
  });
}

export function useDeleteWhatsappAccount() {
  const invalidate = useInvalidateAccounts();
  return useMutation({
    mutationFn: deleteWhatsappAccount,
    onSuccess: invalidate,
  });
}

export function useConnectWhatsappAccount() {
  const invalidate = useInvalidateAccounts();
  return useMutation({
    mutationFn: connectWhatsappAccount,
    onSuccess: invalidate,
  });
}

export function useReconnectWhatsappAccount() {
  const invalidate = useInvalidateAccounts();
  return useMutation({
    mutationFn: reconnectWhatsappAccount,
    onSuccess: invalidate,
  });
}

export function useDisconnectWhatsappAccount() {
  const invalidate = useInvalidateAccounts();
  return useMutation({
    mutationFn: disconnectWhatsappAccount,
    onSuccess: invalidate,
  });
}

export function useWhatsappAccountQr() {
  const invalidate = useInvalidateAccounts();
  return useMutation({
    mutationFn: fetchWhatsappAccountQr,
    onSuccess: invalidate,
  });
}

const CONNECTION_STATUS_KEY = (id: number) => ["whatsapp", "accounts", id, "connection-status"] as const;

/**
 * Polls the account's live connection status while the connect wizard is
 * open. The wizard derives QR/pairing/connected state from this snapshot.
 */
export function useWhatsappAccountConnectionStatus(id: number | null, options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  return useQuery({
    queryKey: CONNECTION_STATUS_KEY(id ?? 0),
    queryFn: () => fetchWhatsappAccountConnectionStatus(id as number),
    enabled: enabled && id !== null,
    // Linking is time-sensitive: poll briskly while the wizard is open.
    refetchInterval: 3_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
    retry: 1,
  });
}

export function useSetActiveWhatsappAccount() {
  const invalidate = useInvalidateAccounts();
  return useMutation({
    mutationFn: ({ id, force = false }: { id: number; force?: boolean }) =>
      force ? setActiveForceWhatsappAccount(id) : setActiveWhatsappAccount(id),
    onSuccess: invalidate,
  });
}

/**
 * Derive the user-facing error message from an accounts API failure.
 * Keeps the "business rule" 409s (set-active refused, duplicate name) and
 * gateway outages (502) human-readable in one place.
 */
export function whatsappAccountErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message || fallback;
  }
  return fallback;
}

export type { WhatsappAccount };
