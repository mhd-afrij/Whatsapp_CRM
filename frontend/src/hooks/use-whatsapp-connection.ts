"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useSocket } from "@/providers/socket-provider";
import {
  connectWhatsapp,
  disconnectWhatsapp,
  fetchWhatsappConnectionHistory,
  fetchWhatsappStatus,
  logoutWhatsapp,
  reconnectWhatsapp,
  type WhatsappStatus,
  type WhatsappSyncStatus,
} from "@/lib/whatsapp-api";

export const WHATSAPP_STATUS_KEY = ["whatsapp", "status"] as const;
export const WHATSAPP_HISTORY_KEY = ["whatsapp", "connection-history"] as const;

/**
 * Subscribes to the gateway's `connection.updated` Socket.IO event (see
 * docs/EVENT_CATALOG.md) and keeps the whatsapp status query in sync live.
 * Falls back to polling only while the socket itself isn't connected, so we
 * never double-fetch when the live channel is healthy.
 */
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
  });

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
    const joinRoom = () => {
      socket.emit("join", `workspace:${user.workspace_id}`);
    };

    // The gateway emits sync.started / sync.progress / sync.completed /
    // sync.failed while a historical import runs (docs/EVENT_CATALOG.md).
    // The status payload carries the same `sync` shape, so merge each event
    // into the status query cache and let the settings page re-render live.
    const handleSyncEvent = (payload: { sync?: WhatsappSyncStatus | null }) => {
      queryClient.setQueryData(WHATSAPP_STATUS_KEY, (current: unknown) => {
        const base =
          (current as WhatsappStatus | undefined) ??
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

  return query;
}

export function useWhatsappConnectionHistory() {
  return useQuery({
    queryKey: WHATSAPP_HISTORY_KEY,
    queryFn: fetchWhatsappConnectionHistory,
  });
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

  return { connect, disconnect, logout, reconnect };
}
