"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useSocket } from "@/providers/socket-provider";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
  type NotificationListResult,
} from "@/lib/notifications-api";

export const NOTIFICATIONS_KEY = ["notifications"] as const;

/**
 * Powers the notification bell: recent notifications + unread count, live via the
 * gateway's `notification.created` event (room `workspace:{id}:user:{id}`, see
 * whatsapp-gateway's emitNotificationCreated / docs/EVENT_CATALOG.md), with the same
 * poll-fallback pattern used by useWhatsappStatus - only polls on an
 * interval when the socket itself isn't connected.
 */
export function useNotifications(enabled: boolean) {
  const { user } = useAuth();
  const { socket, isConnected } = useSocket();
  const queryClient = useQueryClient();

  const query = useQuery<NotificationListResult>({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: () => fetchNotifications({ per_page: 20 }),
    enabled,
    refetchInterval: isConnected ? 60_000 : 15_000,
  });

  useEffect(() => {
    if (!socket || !enabled || !user) return;

    socket.emit("join", `workspace:${user.workspace_id}:user:${user.id}`);

    const handleCreated = () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    };

    socket.on("notification.created", handleCreated);
    return () => {
      socket.off("notification.created", handleCreated);
    };
  }, [socket, enabled, user, queryClient]);

  const markRead = useMutation({
    mutationFn: (id: number) => markNotificationRead(id),
    onSuccess: (updated: AppNotification) => {
      queryClient.setQueryData<NotificationListResult | undefined>(NOTIFICATIONS_KEY, (current) => {
        if (!current) return current;
        return {
          data: current.data.map((n) => (n.id === updated.id ? updated : n)),
          meta: { ...current.meta, unread_count: Math.max(0, current.meta.unread_count - 1) },
        };
      });
    },
  });

  const markAllRead = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.setQueryData<NotificationListResult | undefined>(NOTIFICATIONS_KEY, (current) => {
        if (!current) return current;
        return {
          data: current.data.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })),
          meta: { ...current.meta, unread_count: 0 },
        };
      });
    },
  });

  return {
    notifications: query.data?.data ?? [],
    unreadCount: query.data?.meta.unread_count ?? 0,
    isLoading: query.isLoading,
    markRead,
    markAllRead,
  };
}
