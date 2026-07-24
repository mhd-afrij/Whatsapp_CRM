"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, MoreVertical, Paperclip, Send, Smile, Tag, UserPlus, X } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { authFetch } from "@/stores/auth-store";
import { getSyncSocket } from "@/lib/socket-client";
import type { TeamMember } from "@/types/admin";
import type { ConversationMessage, ConversationSummary } from "@/types/inbox";

const TABS = ["All", "Unread"] as const;

function formatPhone(phone: string) {
  return phone.startsWith("+") ? phone : `+${phone}`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function InboxPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("All");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [assignMenuOpen, setAssignMenuOpen] = useState(false);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState("");

  const conversationsQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: () => authFetch<ConversationSummary[]>("/conversations"),
    refetchInterval: 20_000,
  });

  const teamQuery = useQuery({
    queryKey: ["inbox", "team"],
    queryFn: () => authFetch<TeamMember[]>("/users"),
    enabled: assignMenuOpen,
  });

  const messagesQuery = useQuery({
    queryKey: ["conversation-messages", selectedId],
    queryFn: () => authFetch<ConversationMessage[]>(`/conversations/${selectedId}/messages`),
    enabled: selectedId !== null,
  });

  useEffect(() => {
    const socket = getSyncSocket();
    const onIncoming = () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (selectedId !== null) {
        void queryClient.invalidateQueries({ queryKey: ["conversation-messages", selectedId] });
      }
    };
    socket.on("message:incoming", onIncoming);
    return () => {
      socket.off("message:incoming", onIncoming);
    };
  }, [queryClient, selectedId]);

  const conversations = useMemo(
    () => (conversationsQuery.data ?? []).filter((c) => (activeTab === "Unread" ? c.unread_count > 0 : true)),
    [conversationsQuery.data, activeTab]
  );

  const selected = conversationsQuery.data?.find((c) => c.id === selectedId) ?? null;

  const sendMessage = useMutation({
    mutationFn: async ({ id, text }: { id: number; text: string }) =>
      authFetch<ConversationMessage>(`/conversations/${id}/messages`, {
        method: "POST",
        body: { body: text },
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["conversation-messages", variables.id] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setDraft("");
    },
  });

  const assignConversation = useMutation({
    mutationFn: async ({ id, assigneeId }: { id: number; assigneeId: number | null }) =>
      authFetch<ConversationSummary>(`/conversations/${id}/assign`, {
        method: "PATCH",
        body: { assignee_id: assigneeId },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setAssignMenuOpen(false);
    },
  });

  const closeConversation = useMutation({
    mutationFn: async (id: number) =>
      authFetch<ConversationSummary>(`/conversations/${id}/close`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const updateTags = useMutation({
    mutationFn: async ({ id, tags }: { id: number; tags: string[] }) =>
      authFetch<ConversationSummary>(`/conversations/${id}/tags`, {
        method: "PATCH",
        body: { tags },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  function handleSend() {
    if (!selected || !draft.trim()) return;
    sendMessage.mutate({ id: selected.id, text: draft.trim() });
  }

  function handleSelect(id: number) {
    setSelectedId(id);
    setAssignMenuOpen(false);
    setTagMenuOpen(false);
  }

  function handleAddTag() {
    if (!selected || !tagDraft.trim()) return;
    const nextTags = [...(selected.tags ?? []), tagDraft.trim()];
    updateTags.mutate({ id: selected.id, tags: nextTags });
    setTagDraft("");
  }

  function handleRemoveTag(tag: string) {
    if (!selected) return;
    updateTags.mutate({ id: selected.id, tags: (selected.tags ?? []).filter((t) => t !== tag) });
  }

  return (
    <div className="-m-6 flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Conversation list */}
      <div className="w-full sm:w-[320px] shrink-0 border-r border-border-muted flex flex-col">
        <div className="p-3 border-b border-border-muted overflow-x-auto">
          <div className="flex gap-1">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === tab
                    ? "bg-primary-soft text-primary"
                    : "text-text-secondary hover:bg-surface-hover"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <div className="p-4 text-sm text-text-muted">
              {conversationsQuery.isLoading
                ? "Loading conversations…"
                : "No conversations yet. New WhatsApp messages will appear here automatically."}
            </div>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => handleSelect(c.id)}
              className={`w-full text-left flex gap-3 px-3 py-3 border-b border-border-muted hover:bg-surface-hover transition-colors ${
                selectedId === c.id ? "bg-surface-hover" : ""
              }`}
            >
              <div className="h-9 w-9 shrink-0 rounded-full bg-surface-raised border border-border flex items-center justify-center text-xs font-medium text-text-primary">
                {(c.contact_name ?? formatPhone(c.contact_phone)).slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {c.contact_name ?? formatPhone(c.contact_phone)}
                  </p>
                  <span className="text-[11px] text-text-muted shrink-0">
                    {c.last_message_at ? formatTime(c.last_message_at) : ""}
                  </span>
                </div>
                <p className="text-xs text-text-secondary truncate mt-0.5">{formatPhone(c.contact_phone)}</p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <StatusBadge
                    label={c.status}
                    tone={c.status === "open" ? "primary" : c.status === "pending" ? "warning" : "neutral"}
                  />
                  {c.unread_count > 0 && (
                    <span className="ml-auto h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
                      {c.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat panel */}
      <div className="hidden sm:flex flex-1 flex-col min-w-0">
        {selected ? (
          <>
            <div className="h-16 border-b border-border-muted flex items-center justify-between px-4 shrink-0">
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {selected.contact_name ?? formatPhone(selected.contact_phone)}
                </p>
                <p className="text-xs text-text-muted">{formatPhone(selected.contact_phone)}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <button
                    onClick={() => {
                      setAssignMenuOpen((open) => !open);
                      setTagMenuOpen(false);
                    }}
                    className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-text-secondary hover:bg-surface-hover"
                  >
                    <UserPlus size={13} /> Assign
                  </button>
                  {assignMenuOpen && (
                    <>
                      <button
                        className="fixed inset-0 z-10 cursor-default"
                        aria-label="Close assign menu"
                        onClick={() => setAssignMenuOpen(false)}
                      />
                      <div className="absolute right-0 top-full mt-1 z-20 w-48 rounded-md border border-border bg-surface-raised shadow-lg py-1">
                        <button
                          onClick={() => assignConversation.mutate({ id: selected.id, assigneeId: null })}
                          className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover"
                        >
                          Unassigned
                        </button>
                        {(teamQuery.data ?? []).map((member) => (
                          <button
                            key={member.id}
                            onClick={() => assignConversation.mutate({ id: selected.id, assigneeId: member.id })}
                            className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover"
                          >
                            {member.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="relative">
                  <button
                    onClick={() => {
                      setTagMenuOpen((open) => !open);
                      setAssignMenuOpen(false);
                    }}
                    className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-text-secondary hover:bg-surface-hover"
                  >
                    <Tag size={13} /> Tag
                  </button>
                  {tagMenuOpen && (
                    <>
                      <button
                        className="fixed inset-0 z-10 cursor-default"
                        aria-label="Close tag menu"
                        onClick={() => setTagMenuOpen(false)}
                      />
                      <div className="absolute right-0 top-full mt-1 z-20 w-56 rounded-md border border-border bg-surface-raised shadow-lg p-3 space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          {(selected.tags ?? []).length === 0 ? (
                            <span className="text-xs text-text-muted">No tags yet</span>
                          ) : (
                            selected.tags?.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center gap-1 rounded-full bg-primary-soft text-primary text-[11px] px-2 py-0.5"
                              >
                                {tag}
                                <button onClick={() => handleRemoveTag(tag)} aria-label={`Remove ${tag}`}>
                                  <X size={10} />
                                </button>
                              </span>
                            ))
                          )}
                        </div>
                        <div className="flex gap-1.5">
                          <input
                            value={tagDraft}
                            onChange={(event) => setTagDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                handleAddTag();
                              }
                            }}
                            placeholder="Add tag"
                            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                          />
                          <button
                            onClick={handleAddTag}
                            className="rounded-md bg-primary text-primary-foreground px-2 py-1 text-xs"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <button
                  onClick={() => closeConversation.mutate(selected.id)}
                  disabled={closeConversation.isPending}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs disabled:opacity-60 ${
                    selected.status === "closed"
                      ? "border border-border text-text-secondary hover:bg-surface-hover"
                      : "bg-primary-soft text-primary"
                  }`}
                >
                  <Check size={13} /> {selected.status === "closed" ? "Reopen" : "Close"}
                </button>
                <button className="rounded-md p-1.5 text-text-secondary hover:bg-surface-hover">
                  <MoreVertical size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {(messagesQuery.data ?? []).map((m) => (
                <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[70%] rounded-[10px] px-3 py-2 text-sm ${
                      m.direction === "out"
                        ? "bg-primary-soft text-text-primary"
                        : "bg-surface border border-border text-text-primary"
                    }`}
                  >
                    <p>{m.body}</p>
                    <p className="text-[10px] text-text-muted mt-1 text-right">{formatTime(m.sent_at)}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-border-muted p-3 shrink-0">
              <div className="flex items-end gap-2 rounded-md border border-border bg-surface px-3 py-2">
                <button className="text-text-muted hover:text-text-secondary" aria-label="Attach file" disabled>
                  <Paperclip size={16} />
                </button>
                <button className="text-text-muted hover:text-text-secondary" aria-label="Emoji" disabled>
                  <Smile size={16} />
                </button>
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
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
                  aria-label="Send"
                >
                  <Send size={15} />
                </button>
              </div>
              {sendMessage.isError && (
                <p className="text-[11px] text-danger mt-1.5">Failed to send. Check the WhatsApp connection.</p>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-text-muted">
            Select a conversation to view messages.
          </div>
        )}
      </div>

      {/* Contact panel */}
      <div className="hidden lg:flex w-[280px] shrink-0 border-l border-border-muted flex-col p-4 gap-4 overflow-y-auto">
        {selected ? (
          <>
            <div className="flex flex-col items-center text-center">
              <div className="h-14 w-14 rounded-full bg-surface-raised border border-border flex items-center justify-center text-lg font-medium text-text-primary mb-2">
                {(selected.contact_name ?? formatPhone(selected.contact_phone)).slice(0, 2)}
              </div>
              <p className="text-sm font-medium text-text-primary">
                {selected.contact_name ?? formatPhone(selected.contact_phone)}
              </p>
              <p className="text-xs text-text-muted">{formatPhone(selected.contact_phone)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">Status</p>
              <StatusBadge
                label={selected.status}
                tone={selected.status === "open" ? "primary" : selected.status === "pending" ? "warning" : "neutral"}
              />
            </div>
            <div>
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">Assignee</p>
              <span className="text-xs text-text-muted">{selected.assignee?.name ?? "Unassigned"}</span>
            </div>
            <div>
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {(selected.tags ?? []).length ? (
                  selected.tags?.map((tag) => <StatusBadge key={tag} label={tag} />)
                ) : (
                  <span className="text-xs text-text-muted">No tags</span>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">Open tasks</p>
              <span className="text-xs text-text-muted">None</span>
            </div>
          </>
        ) : (
          <p className="text-xs text-text-muted">No contact selected.</p>
        )}
      </div>
    </div>
  );
}
