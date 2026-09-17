"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useSocket } from "@/providers/socket-provider";
import { isGatewayRecoverableError } from "@/lib/api-client";
import { resolveCanonicalState, type CanonicalConnectionState } from "@/lib/whatsapp-connection";
import {
  connectWhatsapp,
  disconnectWhatsapp,
  fetchWhatsappConnectionHistory,
  fetchWhatsappQr,
  fetchWhatsappStatus,
  logoutWhatsapp,
  reconnectWhatsapp,
  type WhatsappStatus,
  type WhatsappSyncStatus,
} from "@/lib/whatsapp-api";

export const WHATSAPP_STATUS_KEY = ["whatsapp", "status"] as const;
export const WHATSAPP_HISTORY_KEY = ["whatsapp", "connection-history"] as const;

const GATEWAY_RETRY_DELAY_MS = 5_000;

export function useWhatsappStatus(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { socket, isConnected } = useSocket();
  const query = useQuery({
    queryKey: WHATSAPP_STATUS_KEY,
    queryFn: fetchWhatsappStatus,
    refetchInterval: isConnected ? false : 5_000,
    refetchOnWindowFocus: true,
    staleTime: 2_000,
    enabled,
    // A gateway outage is never a fatal error: keep retrying (with a calm,
    // fixed delay) until the gateway is reachable again instead of giving up
    // after the provider-level `retry: 1`. Any other transient failure still
    // gets a limited number of quick retries before surfacing as an error.
    retry: (failureCount, error) => (isGatewayRecoverableError(error) ? true : failureCount < 2),
    retryDelay: (_retryAttempt, error) =>
      isGatewayRecoverableError(error) ? GATEWAY_RETRY_DELAY_MS : Math.min(1_000 * 2 ** _retryAttempt, 15_000),
  });

  // Canonical connection state derived from the last success OR a recoverable
  // gateway failure. While the gateway is down, `isError` is set but the state
  // is still the friendly (recoverable, auto-retrying) gateway_unavailable.
  const gatewayUnavailable = isGatewayRecoverableError(query.error);
  const canonicalState: CanonicalConnectionState = gatewayUnavailable
    ? "gateway_unavailable"
    : resolveCanonicalState(query.data);

  useEffect(() => {
    if (!socket || !enabled || !user?.workspace_id) return;
    const handleUpdate = (payload: WhatsappStatus) => {
      queryClient.setQueryData(WHATSAPP_STATUS_KEY, payload);
      queryClient.invalidateQueries({ queryKey: WHATSAPP_HISTORY_KEY });
    };
    const refreshStatus = () => {
      void queryClient.invalidateQueries({ queryKey: WHATSAPP_STATUS_KEY });
      void queryClient.refetchQueries({ queryKey: WHATSAPP_STATUS_KEY });
    };
    const joinRoom = () => socket.emit("join", "workspace:" + user.workspace_id);
    const handleSyncEvent = (payload: { sync?: WhatsappSyncStatus | null }) => {
      queryClient.setQueryData(WHATSAPP_STATUS_KEY, (current: unknown) => {
        const base = (current as WhatsappStatus | undefined) ??
          ({ status: "idle", qrCode: null, qrExpiresAt: null, phoneNumber: null } as WhatsappStatus);
        return { ...base, sync: payload.sync ?? null };
      });
    };

    joinRoom();
    socket.on("connect", joinRoom);
    socket.on("connect", refreshStatus);
    socket.on("disconnect", refreshStatus);
    socket.on("connection.updated", handleUpdate);
    socket.on("sync.started", handleSyncEvent);
    socket.on("sync.progress", handleSyncEvent);
    socket.on("sync.completed", handleSyncEvent);
    socket.on("sync.failed", handleSyncEvent);
    return () => {
      socket.off("connect", joinRoom);
      socket.off("connect", refreshStatus);
      socket.off("disconnect", refreshStatus);
      socket.off("connection.updated", handleUpdate);
      socket.off("sync.started", handleSyncEvent);
      socket.off("sync.progress", handleSyncEvent);
      socket.off("sync.completed", handleSyncEvent);
      socket.off("sync.failed", handleSyncEvent);
    };
  }, [socket, queryClient, enabled, user?.workspace_id]);

  return {
    ...query,
    canonicalState,
    gatewayUnavailable,
    lastCheckedAt: query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : null,
  };
}

export function useWhatsappConnectionHistory() {
  return useQuery({ queryKey: WHATSAPP_HISTORY_KEY, queryFn: fetchWhatsappConnectionHistory });
}

export function useWhatsappActions() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: WHATSAPP_STATUS_KEY });
    queryClient.invalidateQueries({ queryKey: WHATSAPP_HISTORY_KEY });
    void queryClient.refetchQueries({ queryKey: WHATSAPP_STATUS_KEY });
    void queryClient.refetchQueries({ queryKey: WHATSAPP_HISTORY_KEY });
  };
  const connect = useMutation({ mutationFn: connectWhatsapp, onSuccess: invalidate });
  const disconnect = useMutation({ mutationFn: disconnectWhatsapp, onSuccess: invalidate });
  const logout = useMutation({ mutationFn: logoutWhatsapp, onSuccess: invalidate });
  const reconnect = useMutation({ mutationFn: reconnectWhatsapp, onSuccess: invalidate });
  const generateQr = useMutation({
    mutationFn: fetchWhatsappQr,
    onSuccess: (partial) => {
      queryClient.setQueryData<WhatsappStatus>(WHATSAPP_STATUS_KEY, (current) => ({
        ...(current ?? { status: "idle", qrCode: null, qrExpiresAt: null, phoneNumber: null }),
        ...partial,
      }));
    },
  });
  // One-shot "retry now / check again" without going through a full connect;
  // used by the gateway-unavailable UI so an agent can probe immediately
  // instead of waiting for the next auto retry.
  const checkNow = useMutation({
    mutationFn: fetchWhatsappStatus,
    onSuccess: (status) => {
      queryClient.setQueryData<WhatsappStatus>(WHATSAPP_STATUS_KEY, status);
    },
    onSettled: () => invalidate(),
  });
  return { connect, disconnect, logout, reconnect, generateQr, checkNow };
}