"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Filter, MoreVertical, PenSquare, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConversationList } from "@/hooks/use-conversations";
import type { Conversation, ConversationFilters } from "@/lib/conversations-api";
import { useAuth } from "@/context/auth-context";
import { useWhatsappStatus } from "@/hooks/use-whatsapp-connection";
import type { WhatsappConnectionStatus } from "@/lib/whatsapp-api";
import { ErrorState } from "@/components/ui/error-state";
import { Avatar } from "@/components/ui/avatar";
import { PriorityIndicator } from "@/components/inbox/priority-selector";

type FilterPill = {
  key: string;
  label: string;
  filters: ConversationFilters;
};

const FILTER_PILLS: FilterPill[] = [
  { key: "all", label: "All", filters: {} },
  { key: "unread", label: "Unread", filters: { unread: true } },
  { key: "assigned", label: "Assigned to me", filters: { assigned_to: "me" } },
  { key: "unassigned", label: "Unassigned", filters: { assigned_to: "unassigned" } },
  { key: "open", label: "Open", filters: { status: "open" } },
  { key: "closed", label: "Closed", filters: { status: "closed" } },
];

const COMPACT_PILL_KEYS = ["all", "unread"];

const SESSION_STYLES: Record<WhatsappConnectionStatus, { dot: string; label: string }> = {
  idle: { dot: "bg-muted", label: "Not connected" },
  connecting: { dot: "bg-warning animate-pulse", label: "Connecting" },
  qr_pending: { dot: "bg-warning animate-pulse", label: "Scan QR to connect" },
  connected: { dot: "bg-success", label: "Connected" },
  disconnected: { dot: "bg-danger", label: "Disconnected" },
  reconnecting: { dot: "bg-warning animate-pulse", label: "Reconnecting" },
  auth_required: { dot: "bg-danger", label: "Re-authentication required" },
  error: { dot: "bg-danger", label: "Connection error" },
};

function SessionStatusStrip() {
  const { data } = useWhatsappStatus();
  const status = data?.status ?? "idle";
  const style = SESSION_STYLES[status];
  const phone = data?.phoneNumber ?? null;

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border bg-bg/60 px-3 py-1.5 text-[11px] text-muted">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", style.dot)} />
      <span className="truncate font-medium text-text">{style.label}</span>
      {phone && <span className="ml-auto truncate font-mono">{phone}</span>}
    </div>
  );
}

function FilterMenu({
  activeKey,
  onSelect,
}: {
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const menuItems = FILTER_PILLS.filter((p) => !COMPACT_PILL_KEYS.includes(p.key));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors",
          menuItems.some((p) => p.key === activeKey)
            ? "bg-primary text-white shadow-sm"
            : "bg-primary-soft/50 text-muted hover:bg-primary-soft"
        )}
      >
        <Filter className="h-3.5 w-3.5" />
        Filters
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-xl">
          {menuItems.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                onSelect(p.key);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-primary-soft/50",
                activeKey === p.key ? "font-medium text-primary" : "text-text"
              )}
            >
              {p.label}
              {activeKey === p.key && <span className="text-primary">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function contactLabel(conversation: Conversation): string {
  return (
    conversation.contact?.full_name ||
    conversation.whatsapp_contact?.push_name ||
    conversation.whatsapp_contact?.phone_number ||
    conversation.whatsapp_contact?.wa_jid ||
    `Conversation #${conversation.id}`
  );
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ListSkeleton() {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-md p-3">
          <div className="h-3 w-2/3 rounded bg-border" />
          <div className="mt-2 h-2.5 w-full rounded bg-border/70" />
        </div>
      ))}
    </div>
  );
}

export function ConversationListPanel() {
  const params = useParams<{ conversationId?: string }>();
  const activeId = params?.conversationId ? Number(params.conversationId) : null;
  const [activePill, setActivePill] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const { user } = useAuth();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const pill = FILTER_PILLS.find((p) => p.key === activePill) ?? FILTER_PILLS[0];
  const { data, isLoading, isError, refetch } = useConversationList({
    ...pill.filters,
    per_page: 30,
    search: debouncedSearch || undefined,
  });

  const conversations = data?.data ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border bg-surface">
      <SessionStatusStrip />

      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={user?.name ?? "Me"} size="sm" />
          <span className="truncate text-sm font-semibold text-text">{user?.name ?? "Inbox"}</span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            title="New chat coming soon"
            className="rounded-full p-2 text-muted opacity-50"
          >
            <PenSquare className="h-5 w-5" />
          </button>
          <button
            type="button"
            title="More options coming soon"
            className="rounded-full p-2 text-muted opacity-50"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="shrink-0 border-b border-border p-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations…"
            className="w-full rounded-full border border-border bg-bg py-2 pl-9 pr-3 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          {FILTER_PILLS.filter((p) => COMPACT_PILL_KEYS.includes(p.key)).map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setActivePill(p.key)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                activePill === p.key
                  ? "bg-primary text-white shadow-sm"
                  : "bg-primary-soft/50 text-muted hover:bg-primary-soft"
              )}
            >
              {p.label}
            </button>
          ))}
          <FilterMenu activeKey={activePill} onSelect={setActivePill} />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading && <ListSkeleton />}

        {isError && (
          <ErrorState
            message="Unable to load conversations. Try again shortly."
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && conversations.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="text-sm font-medium text-text">No conversations here</p>
            <p className="text-xs text-muted">
              {search ? "No matches for your search." : "New conversations will show up automatically."}
            </p>
          </div>
        )}

        <ul className="p-2">
          {conversations.map((conversation) => {
            const name = contactLabel(conversation);
            const isActive = activeId === conversation.id;
            return (
              <li key={conversation.id}>
                <Link
                  href={`/inbox/${conversation.id}`}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-primary-soft/40",
                    isActive ? "bg-primary text-white" : "text-text"
                  )}
                >
                  <Avatar name={name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-medium">{name}</span>
                        <PriorityIndicator priority={conversation.priority} />
                      </span>
                      <span className={cn("shrink-0 text-xs", isActive ? "text-white/80" : "text-muted")}>
                        {formatTimestamp(conversation.last_message_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("truncate text-xs", isActive ? "text-white/80" : "text-muted")}>
                        {conversation.last_message_preview ?? "No messages yet"}
                      </span>
                      {conversation.unread_count > 0 && (
                        <span
                          className={cn(
                            "ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            isActive ? "bg-white text-primary-dark" : "bg-primary text-white"
                          )}
                        >
                          {conversation.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
