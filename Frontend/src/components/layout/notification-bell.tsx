"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useNotifications } from "@/hooks/use-notifications";
import {
  NOTIFICATION_TYPE_LABELS,
  notificationLinkFor,
  type AppNotification,
} from "@/lib/notifications-api";
import { cn } from "@/lib/utils";

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function NotificationRow({
  notification,
  onNavigate,
}: {
  notification: AppNotification;
  onNavigate: (notification: AppNotification) => void;
}) {
  const label = NOTIFICATION_TYPE_LABELS[notification.type] ?? notification.type;
  const isUnread = !notification.read_at;

  return (
    <li>
      <button
        type="button"
        onClick={() => onNavigate(notification)}
        className={cn(
          "flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left text-sm hover:bg-primary-soft/50",
          isUnread && "bg-primary-soft/30"
        )}
      >
        <span className="flex w-full items-center gap-2">
          {isUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
          <span className={cn("flex-1 truncate", isUnread ? "font-medium text-text" : "text-muted")}>
            {label}
          </span>
        </span>
        <span className="pl-3.5 text-xs text-muted">{timeAgo(notification.created_at)}</span>
      </button>
    </li>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { notifications, unreadCount, isLoading, markRead, markAllRead } = useNotifications(true);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const onNavigate = (notification: AppNotification) => {
    if (!notification.read_at) {
      markRead.mutate(notification.id);
    }
    setOpen(false);
    const href = notificationLinkFor(notification);
    if (href) {
      router.push(href);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full p-2 text-muted hover:bg-primary-soft hover:text-text"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-border bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <h3 className="text-sm font-semibold text-text">Notifications</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="text-xs font-medium text-primary hover:text-primary-dark disabled:opacity-50"
              >
                Mark all read
              </button>
            )}
          </div>

          <ul className="max-h-96 overflow-y-auto divide-y divide-border">
            {isLoading && <li className="px-4 py-6 text-center text-sm text-muted">Loading…</li>}
            {!isLoading && notifications.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted">No notifications yet.</li>
            )}
            {!isLoading &&
              notifications.map((notification) => (
                <NotificationRow key={notification.id} notification={notification} onNavigate={onNavigate} />
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
