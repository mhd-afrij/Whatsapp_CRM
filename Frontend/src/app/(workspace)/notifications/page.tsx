"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { authFetch } from "@/stores/auth-store";

interface NotificationItem {
  id: number;
  type: string;
  title: string;
  entity_type: string | null;
  entity_id: number | null;
  read_at: string | null;
  created_at: string;
}

function timeAgo(dateIso: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateIso).getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => authFetch<NotificationItem[]>("/notifications"),
    refetchInterval: 30_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => authFetch<NotificationItem>(`/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: invalidate,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => authFetch<null>("/notifications/read-all", { method: "POST" }),
    onSuccess: invalidate,
  });

  const notifications = data ?? [];
  const hasUnread = notifications.some((n) => !n.read_at);

  return (
    <div>
      <PageHeader
        title="Notifications"
        actions={
          <button
            onClick={() => markAllReadMutation.mutate()}
            disabled={!hasUnread || markAllReadMutation.isPending}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover disabled:opacity-50"
          >
            <CheckCheck size={15} /> Mark all read
          </button>
        }
      />

      {isLoading && (
        <div className="space-y-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-[10px] bg-surface border border-border-muted animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <EmptyState icon={Bell} title="Couldn't load notifications" description="The API may be unreachable." />
      )}

      {!isLoading && notifications.length === 0 && (
        <EmptyState icon={Bell} title="You're all caught up" description="New assignments and mentions will show up here." />
      )}

      {notifications.length > 0 && (
        <div className="space-y-1">
          {notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => !n.read_at && markReadMutation.mutate(n.id)}
              className={`w-full flex items-start gap-3 rounded-[10px] px-4 py-3 border text-left ${
                n.read_at ? "border-border-muted bg-surface" : "border-primary/30 bg-primary-soft"
              }`}
            >
              <Bell size={16} className={n.read_at ? "text-text-muted" : "text-primary"} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${n.read_at ? "text-text-secondary" : "text-text-primary font-medium"}`}>
                  {n.title}
                </p>
                <p className="text-xs text-text-muted mt-0.5">{timeAgo(n.created_at)}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
