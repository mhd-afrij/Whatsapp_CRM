import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Search, Filter, CheckCheck, Check, Clock, UserPlus, X, Tag, MoreHorizontal } from "lucide-react";
import { authFetch } from "../../store/index.js";
import { useSocket } from "../../providers/SocketProvider.jsx";

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
];

function formatTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d`;
}

function MessageStatus({ status }) {
  if (status === "read") return <CheckCheck size={12} className="text-primary" />;
  if (status === "delivered") return <CheckCheck size={12} className="text-text-muted" />;
  return <Check size={12} className="text-text-muted" />;
}

function UnreadBadge({ count }) {
  if (!count || count === 0) return null;
  return (
    <span className="ml-auto shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground min-w-[18px] text-center">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function InboxPage({ title }) {
  const queryClient = useQueryClient();
  const { on } = useSocket();
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showMetadata, setShowMetadata] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);
  const [newTag, setNewTag] = useState("");
  const messagesEndRef = useRef(null);
  const searchInputRef = useRef(null);

  const conversationsQuery = useQuery({
    queryKey: ["conversations", { status: statusFilter, search }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("search", search);
      const qs = params.toString();
      return authFetch(`/conversations${qs ? `?${qs}` : ""}`);
    },
    refetchInterval: 20000,
  });

  const messagesQuery = useQuery({
    queryKey: ["conversation-messages", selectedId],
    queryFn: () => authFetch(`/conversations/${selectedId}/messages?per_page=100`),
    enabled: selectedId !== null,
  });

  const agentsQuery = useQuery({
    queryKey: ["agents"],
    queryFn: () => authFetch("/conversations/agents"),
    enabled: showAssignModal,
  });

  const sendMessage = useMutation({
    mutationFn: ({ id, text }) =>
      authFetch(`/conversations/${id}/messages`, { method: "POST", body: { body: text } }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["conversation-messages", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setDraft("");
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({ conversationId, assigneeId }) =>
      authFetch(`/conversations/${conversationId}/assign`, {
        method: "PATCH",
        body: { assignee_id: assigneeId },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setShowAssignModal(false);
    },
  });

  const closeMutation = useMutation({
    mutationFn: (conversationId) =>
      authFetch(`/conversations/${conversationId}/close`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversations"] }),
  });

  const tagMutation = useMutation({
    mutationFn: ({ conversationId, tags }) =>
      authFetch(`/conversations/${conversationId}/tags`, { method: "PATCH", body: { tags } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversations"] }),
  });

  const markReadMutation = useMutation({
    mutationFn: (conversationId) =>
      authFetch(`/conversations/${conversationId}/read`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversations"] }),
  });

  useEffect(() => {
    const unsub = on("message:incoming", (message) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (selectedId) {
        queryClient.invalidateQueries({ queryKey: ["conversation-messages", selectedId] });
      }
    });
    return unsub;
  }, [on, queryClient, selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesQuery.data]);

  useEffect(() => {
    if (selectedId && selected?.unread_count > 0) {
      markReadMutation.mutate(selectedId);
    }
  }, [selectedId]);

  const conversations = conversationsQuery.data?.data ?? [];
  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const messages = messagesQuery.data?.data ?? [];

  function handleSend() {
    if (!selectedId || !draft.trim()) return;
    sendMessage.mutate({ id: selectedId, text: draft.trim() });
  }

  function handleAddTag() {
    if (!newTag.trim() || !selected) return;
    const tags = [...(selected.tags ?? []), newTag.trim()];
    tagMutation.mutate({ conversationId: selected.id, tags });
    setNewTag("");
    setShowTagInput(false);
  }

  function handleRemoveTag(tag) {
    if (!selected) return;
    const tags = (selected.tags ?? []).filter((t) => t !== tag);
    tagMutation.mutate({ conversationId: selected.id, tags });
  }

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unread_count ?? 0), 0),
    [conversations]
  );

  return (
    <div className="-m-6 flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Conversation List */}
      <div className="w-full sm:w-[340px] shrink-0 border-r border-border-muted flex flex-col">
        <div className="p-3 border-b border-border-muted space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-text-primary">
              {title || "Inbox"}
              {totalUnread > 0 && (
                <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                  {totalUnread}
                </span>
              )}
            </h2>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              ref={searchInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="w-full rounded-md border border-border bg-surface pl-8 pr-3 py-1.5 text-sm outline-none focus:border-primary placeholder:text-text-muted"
            />
          </div>
          <div className="flex gap-1">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  statusFilter === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface text-text-secondary hover:bg-surface-hover"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <div className="p-4 text-sm text-text-muted">
              {search ? "No matching conversations." : "No conversations yet."}
            </div>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full text-left flex gap-3 px-3 py-3 border-b border-border-muted hover:bg-surface-hover transition-colors ${
                selectedId === c.id ? "bg-surface-hover" : ""
              }`}
            >
              <div className="relative h-9 w-9 shrink-0 rounded-full bg-surface-raised border border-border flex items-center justify-center text-xs font-medium text-text-primary">
                {(c.contact_name ?? c.contact_phone).slice(0, 2)}
                {c.status === "closed" && (
                  <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-surface border border-border flex items-center justify-center">
                    <X size={8} className="text-text-muted" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {c.contact_name ?? c.contact_phone}
                  </p>
                  <span className="text-[10px] text-text-muted shrink-0">{formatTime(c.last_message_at)}</span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <p className="text-xs text-text-secondary truncate">{c.contact_phone}</p>
                  {c.assignee && (
                    <span className="text-[10px] text-text-muted shrink-0">
                      &middot; {c.assignee.name}
                    </span>
                  )}
                </div>
                {c.tags && c.tags.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {c.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="rounded bg-surface-raised px-1.5 py-0.5 text-[10px] text-text-muted border border-border-muted">
                        {tag}
                      </span>
                    ))}
                    {c.tags.length > 3 && (
                      <span className="text-[10px] text-text-muted">+{c.tags.length - 3}</span>
                    )}
                  </div>
                )}
              </div>
              <UnreadBadge count={c.unread_count} />
            </button>
          ))}
        </div>
      </div>

      {/* Message Thread */}
      <div className="hidden sm:flex flex-1 flex-col min-w-0">
        {selected ? (
          <>
            {/* Header */}
            <div className="h-16 border-b border-border-muted flex items-center justify-between px-4 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 rounded-full bg-surface-raised border border-border flex items-center justify-center text-xs font-medium text-text-primary shrink-0">
                  {(selected.contact_name ?? selected.contact_phone).slice(0, 2)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {selected.contact_name ?? selected.contact_phone}
                  </p>
                  <p className="text-xs text-text-muted">{selected.contact_phone}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowMetadata(!showMetadata)}
                  className={`rounded-md p-1.5 transition-colors ${showMetadata ? "bg-surface-hover text-text-primary" : "text-text-muted hover:bg-surface-hover"}`}
                  title="Conversation details"
                >
                  <MoreHorizontal size={16} />
                </button>
                <button
                  onClick={() => closeMutation.mutate(selected.id)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-text-secondary hover:bg-surface-hover transition-colors"
                >
                  {selected.status === "closed" ? "Reopen" : "Close"}
                </button>
              </div>
            </div>

            <div className="flex flex-1 min-h-0">
              {/* Messages */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map((m) => (
                    <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[70%] rounded-[10px] px-3 py-2 text-sm ${
                          m.direction === "out"
                            ? "bg-primary-soft text-text-primary"
                            : "bg-surface border border-border text-text-primary"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{m.body}</p>
                        <div className={`flex items-center gap-1 mt-1 ${m.direction === "out" ? "justify-end" : ""}`}>
                          <span className="text-[10px] text-text-muted">
                            {new Date(m.sent_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {m.direction === "out" && <MessageStatus status={m.status} />}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message Input */}
                <div className="border-t border-border-muted p-3 shrink-0">
                  <div className="flex items-end gap-2 rounded-md border border-border bg-surface px-3 py-2">
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder="Type a message"
                      className="flex-1 bg-transparent text-sm outline-none placeholder:text-text-muted"
                      disabled={sendMessage.isPending}
                    />
                    <button
                      onClick={handleSend}
                      className="rounded-md bg-primary text-primary-foreground p-1.5 disabled:opacity-50"
                      disabled={!draft.trim() || sendMessage.isPending}
                    >
                      <Send size={15} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Metadata Panel */}
              {showMetadata && (
                <div className="w-[280px] shrink-0 border-l border-border-muted overflow-y-auto p-4 space-y-5">
                  <div>
                    <h3 className="text-xs font-medium uppercase tracking-wide text-text-muted mb-2">Contact</h3>
                    <div className="space-y-1">
                      <p className="text-sm text-text-primary">{selected.contact_name ?? "Unknown"}</p>
                      <p className="text-sm text-text-secondary">{selected.contact_phone}</p>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-medium uppercase tracking-wide text-text-muted">Assignee</h3>
                      <button
                        onClick={() => setShowAssignModal(true)}
                        className="text-xs text-primary hover:underline"
                      >
                        {selected.assignee ? "Change" : "Assign"}
                      </button>
                    </div>
                    {selected.assignee ? (
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-surface-raised border border-border flex items-center justify-center text-[10px] font-medium">
                          {selected.assignee.name?.slice(0, 2)}
                        </div>
                        <span className="text-sm text-text-primary">{selected.assignee.name}</span>
                      </div>
                    ) : (
                      <p className="text-sm text-text-muted">Unassigned</p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-medium uppercase tracking-wide text-text-muted">Tags</h3>
                      <button
                        onClick={() => setShowTagInput(!showTagInput)}
                        className="text-xs text-primary hover:underline"
                      >
                        Add
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(selected.tags ?? []).map((tag) => (
                        <span
                          key={tag}
                          className="group flex items-center gap-1 rounded bg-surface-raised px-2 py-0.5 text-xs text-text-secondary border border-border-muted"
                        >
                          {tag}
                          <button
                            onClick={() => handleRemoveTag(tag)}
                            className="text-text-muted hover:text-text-primary"
                          >
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                    {showTagInput && (
                      <div className="flex gap-1 mt-2">
                        <input
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleAddTag();
                          }}
                          placeholder="New tag"
                          className="flex-1 rounded border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-primary"
                        />
                        <button
                          onClick={handleAddTag}
                          className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground"
                        >
                          Add
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="text-xs font-medium uppercase tracking-wide text-text-muted mb-2">Status</h3>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        selected.status === "open"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-surface-raised text-text-muted"
                      }`}
                    >
                      {selected.status}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-text-muted">
            Select a conversation to view messages.
          </div>
        )}
      </div>

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-lg border border-border bg-surface p-6 w-full max-w-sm shadow-lg">
            <h3 className="text-sm font-medium text-text-primary mb-4">Assign conversation</h3>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              <button
                onClick={() => assignMutation.mutate({ conversationId: selected.id, assigneeId: null })}
                className="w-full text-left rounded-md px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover transition-colors"
              >
                Unassigned
              </button>
              {(agentsQuery.data?.data ?? []).map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => assignMutation.mutate({ conversationId: selected.id, assigneeId: agent.id })}
                  className={`w-full text-left rounded-md px-3 py-2 text-sm transition-colors ${
                    selected?.assignee_id === agent.id
                      ? "bg-primary-soft text-primary font-medium"
                      : "text-text-secondary hover:bg-surface-hover"
                  }`}
                >
                  {agent.name}
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setShowAssignModal(false)}
                className="rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
