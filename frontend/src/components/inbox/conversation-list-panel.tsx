"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Loader2,
  MessageCircleMore,
  PenSquare,
  RefreshCcw,
  Search,
  Settings2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useConversationList } from "@/hooks/use-conversations";
import { useWhatsappActions, useWhatsappStatus } from "@/hooks/use-whatsapp-connection";
import { useWorkspaceSettings } from "@/hooks/use-workspace-settings";
import { useConversationFilters, type TabFilter } from "@/hooks/use-conversation-filters";
import { ErrorState } from "@/components/ui/error-state";
import { formatWhatsAppTime } from "@/lib/time-format";
import { ApiError } from "@/lib/api-client";
import { useToast } from "@/providers/toast-provider";
import {
  archiveConversation,
  closeConversation,
  deleteConversation,
  exportConversationChat,
  markConversationUnread,
  muteConversation,
  pinConversation,
  reopenConversation,
  unarchiveConversation,
  unmuteConversation,
  unpinConversation,
  type Conversation,
} from "@/lib/conversations-api";
import { ConversationItem } from "./conversation-item";
import { ActiveFilterChips } from "./active-filter-chips";
import { ConversationFilterPopover } from "./conversation-filter-popover";

type FilterOption = {
  key: TabFilter;
  label: string;
};

const FILTERS: FilterOption[] = [
  { key: "all", label: "All" },
  { key: "mine", label: "Mine" },
  { key: "unassigned", label: "Unassigned" },
  { key: "unread", label: "Unread" },
  { key: "waiting", label: "Waiting" },
  { key: "sla_risk", label: "SLA Risk" },
  { key: "sla_breach", label: "SLA Breached" },
  { key: "archived", label: "Archived" },
];

export function ConversationListPanel() {
  const params = useParams<{ conversationId?: string }>();
  const router = useRouter();
  const activeConversationId = params?.conversationId ? Number(params.conversationId) : null;
  const { tabFilter, advancedFilters, apiFilters, setTab, setAdvanced, clearAdvanced } = useConversationFilters();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const { data: workspace } = useWorkspaceSettings();
  const { data: whatsappStatus } = useWhatsappStatus({ enabled: true });
  const whatsappActions = useWhatsappActions();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const sentinelRef = useRef<HTMLDivElement>(null);

  const invalidateConversations = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
  }, [queryClient]);

  const handleTogglePin = useCallback(
    (conversation: Conversation) => {
      const action = conversation.pinned_at ? unpinConversation(conversation.id) : pinConversation(conversation.id);
      void action.then(invalidateConversations).catch(() => toast("Unable to update pin.", "error"));
    },
    [invalidateConversations, toast]
  );

  const handleToggleArchive = useCallback(
    (conversation: Conversation) => {
      const action = conversation.archived_at
        ? unarchiveConversation(conversation.id)
        : archiveConversation(conversation.id);
      void action.then(invalidateConversations).catch(() => toast("Unable to update archive.", "error"));
    },
    [invalidateConversations, toast]
  );

  const handleToggleMute = useCallback(
    (conversation: Conversation) => {
      const isMuted = Boolean(conversation.muted_until && new Date(conversation.muted_until) > new Date());
      const action = isMuted ? unmuteConversation(conversation.id) : muteConversation(conversation.id);
      void action.then(invalidateConversations).catch(() => toast("Unable to update mute.", "error"));
    },
    [invalidateConversations, toast]
  );

  const handleMarkUnread = useCallback(
    (conversation: Conversation) => {
      void markConversationUnread(conversation.id)
        .then(invalidateConversations)
        .catch(() => toast("Unable to mark as unread.", "error"));
    },
    [invalidateConversations, toast]
  );

  const handleToggleStatus = useCallback(
    (conversation: Conversation) => {
      const action =
        conversation.status === "closed"
          ? reopenConversation(conversation.id)
          : closeConversation(conversation.id);
      void action.then(invalidateConversations).catch(() => toast("Unable to update conversation status.", "error"));
    },
    [invalidateConversations, toast]
  );

  const handleDelete = useCallback(
    (conversation: Conversation) => {
      if (!window.confirm("Delete this conversation and all its messages? This cannot be undone.")) return;
      void deleteConversation(conversation.id)
        .then(() => {
          if (activeConversationId === conversation.id) {
            router.push("/inbox");
          }
          invalidateConversations();
        })
        .catch(() => toast("Unable to delete conversation.", "error"));
    },
    [activeConversationId, invalidateConversations, router, toast]
  );

  const handleExport = useCallback(
    async (conversation: Conversation) => {
      try {
        await exportConversationChat(conversation);
        toast("Chat exported.", "success");
      } catch (error) {
        toast(error instanceof ApiError ? error.message : "Unable to export chat.", "error");
      }
    },
    [toast]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const {
    data,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useConversationList({
    ...apiFilters,
    per_page: 30,
    search: debouncedSearch || undefined,
  });

  // Pagination + socket upserts can transiently duplicate (or, if a partial row
  // ever sneaks in, de-key) entries - dedupe by id so every rendered item has a
  // stable unique key.
  const conversations = useMemo(() => {
    const all = data?.pages.flatMap((page) => page.data) ?? [];
    const seen = new Set<number>();
    return all.filter((conversation) => {
      if (typeof conversation.id !== "number" || seen.has(conversation.id)) return false;
      seen.add(conversation.id);
      return true;
    });
  }, [data]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void fetchNextPage();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, conversations.length]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden border-r border-border bg-surface">
      <header className="border-b border-border px-3 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text">WhatsApp Inbox</p>
            <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted">
              {whatsappStatus?.status === "connected" ? (
                <Wifi className="h-3.5 w-3.5 text-success" />
              ) : (
                <WifiOff className="h-3.5 w-3.5 text-danger" />
              )}
              <span className="truncate">
                {whatsappStatus?.phoneNumber
                  ? `Connected ${whatsappStatus.phoneNumber}`
                  : whatsappStatus?.status === "connected"
                    ? "Connected"
                    : "No active connection"}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1 sm:justify-end">
            <button
              type="button"
              onClick={() => void whatsappActions.reconnect.mutateAsync()}
              aria-label="Reconnect WhatsApp"
              className="rounded-full p-2 text-muted hover:bg-bg hover:text-text"
            >
              <RefreshCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => router.push("/settings/whatsapp")}
              aria-label="WhatsApp settings"
              className="rounded-full p-2 text-muted hover:bg-bg hover:text-text"
            >
              <Settings2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => router.push("/contacts/new")}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark"
            >
              <PenSquare className="h-4 w-4" />
              <span className="hidden sm:inline">New Chat</span>
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-bg px-2 py-1">
            <MessageCircleMore className="h-3 w-3" />
            <span className="capitalize">{whatsappStatus?.status ?? "idle"}</span>
          </span>
          {workspace?.timezone && (
            <span className="truncate rounded-full border border-border bg-bg px-2 py-1">
              {workspace.timezone}
            </span>
          )}
        </div>
      </header>

      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations"
            className="w-full rounded-2xl border border-border bg-bg py-2.5 pl-9 pr-3 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="mt-2.5 flex items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setTab(filter.key)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                tabFilter === filter.key
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-bg text-muted hover:text-text"
              )}
            >
              {filter.label}
            </button>
          ))}
          <div className="ml-auto shrink-0">
            <ConversationFilterPopover
              filters={advancedFilters}
              onFiltersChange={setAdvanced}
            />
          </div>
        </div>
      </div>

      {Object.values(advancedFilters).some((v) => v !== undefined) && (
        <ActiveFilterChips
          filters={advancedFilters}
          onRemove={(key) => setAdvanced({ ...advancedFilters, [key]: undefined })}
          onClear={clearAdvanced}
        />
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading && (
          <div className="space-y-2 p-2.5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-2xl bg-bg" />
            ))}
          </div>
        )}

        {isError && (
          <div className="p-2.5">
            <ErrorState
              message="Unable to load conversations."
              onRetry={() => refetch()}
            />
          </div>
        )}

        {!isLoading && !isError && conversations.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center p-5 text-center">
            <p className="text-sm font-medium text-text">No conversations found</p>
            <p className="mt-1 text-xs text-muted">
              {search ? "Try a different search term." : "Incoming chats will appear here."}
            </p>
          </div>
        )}

        <div>
          {conversations.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              isSelected={activeConversationId === conversation.id}
              onClick={() => router.push(`/inbox/${conversation.id}`)}
              formatTime={(date) => formatWhatsAppTime(date, workspace?.timezone)}
              onTogglePin={() => handleTogglePin(conversation)}
              onToggleArchive={() => handleToggleArchive(conversation)}
              onToggleMute={() => handleToggleMute(conversation)}
              onMarkUnread={() => handleMarkUnread(conversation)}
              onToggleStatus={() => handleToggleStatus(conversation)}
              onDelete={() => handleDelete(conversation)}
              onExport={() => handleExport(conversation)}
            />
          ))}
        </div>

        {hasNextPage && (
          <div
            ref={sentinelRef}
            className="flex items-center justify-center gap-2 py-3 text-xs text-muted"
          >
            {isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>{isFetchingNextPage ? "Loading more…" : "Scroll for more"}</span>
          </div>
        )}
      </div>
    </div>
  );
}
