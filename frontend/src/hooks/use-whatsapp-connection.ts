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
  reconnectWhatsapp,
  type WhatsappStatus,
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
    enabled,
  });

  useEffect(() => {
    if (!socket || !enabled || !user?.workspace_id) return;

    socket.emit("join", `workspace:${user.workspace_id}`);

    const handleUpdate = (payload: WhatsappStatus) => {
      queryClient.setQueryData(WHATSAPP_STATUS_KEY, payload);
      queryClient.invalidateQueries({ queryKey: WHATSAPP_HISTORY_KEY });
    };

    socket.on("connection.updated", handleUpdate);
    return () => {
      socket.off("connection.updated", handleUpdate);
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
  };

  const connect = useMutation({ mutationFn: connectWhatsapp, onSuccess: invalidate });
  const disconnect = useMutation({ mutationFn: disconnectWhatsapp, onSuccess: invalidate });
  const reconnect = useMutation({ mutationFn: reconnectWhatsapp, onSuccess: invalidate });

  return { connect, disconnect, reconnect };
}
