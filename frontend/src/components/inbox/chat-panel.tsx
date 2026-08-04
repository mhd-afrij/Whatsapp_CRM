"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Clock,
  Lock,
  MoreVertical,
  Paperclip,
  Phone,
  Search,
  Send,
  Smile,
  Video,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermission } from "@/hooks/use-permission";
import {
  useConversation,
  useConversationActions,
  useLoadOlderMessages,
  useMessages,
  useSendMessage,
} from "@/hooks/use-conversations";
import { useCreateNote, useNoteList } from "@/hooks/use-notes";
import { useComposerDraft } from "@/hooks/use-composer-draft";
import { ApiError } from "@/lib/api-client";
import type { ConversationPriority, Message } from "@/lib/conversations-api";
import { MediaPreview } from "./media-preview";
import { Avatar } from "@/components/ui/avatar";
import { PRIORITY_OPTIONS } from "@/components/inbox/priority-selector";

const NEAR_BOTTOM_THRESHOLD_PX = 80;
const NEAR_TOP_THRESHOLD_PX = 80;

function contactLabel(conversation: ReturnType<typeof useConversation>["data"]): string {
  if (!conversation) return "";
  return (
    conversation.contact?.full_name ||
    conversation.whatsapp_contact?.push_name ||
    conversation.whatsapp_contact?.phone_number ||
    conversation.whatsapp_contact?.wa_jid ||
    `Conversation #${conversation.id}`
  );
}

function contactSubtitle(conversation: ReturnType<typeof useConversation>["data"]): string {
  if (!conversation) return "";
  const number =
    conversation.whatsapp_contact?.phone_number ?? conversation.whatsapp_contact?.wa_jid ?? null;
  const isOnline = conversation.whatsapp_contact?.is_online;
  const statusLabel =
    isOnline === true
      ? "online"
      : conversation.status === "open"
        ? "last seen recently"
        : conversation.status;
  return [number, statusLabel].filter(Boolean).join(" · ");
}

function StatusTick({ status }: { status: Message["status"] }) {
  if (status === "failed") return <XCircle className="h-3 w-3 text-danger" />;
  if (status === "read") return <CheckCheck className="h-3 w-3 text-info" />;
  if (status === "delivered") return <CheckCheck className="h-3 w-3 text-muted" />;
  if (status === "sent") return <Check className="h-3 w-3 text-muted" />;
  return <Clock className="h-3 w-3 text-muted" />;
}

function dateSeparatorLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function MessageBubble({
  message,
  conversationId,
  allMessages,
}: {
  message: Message;
  conversationId: number;
  allMessages: Message[];
}) {
  const isOutbound = message.direction === "outbound";
  const repliedTo = message.replied_to_message_id
    ? allMessages.find((m) => m.id === message.replied_to_message_id)
    : null;

  return (
    <div className={cn("flex", isOutbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[min(72%,680px)] px-2.5 py-1.5 text-sm shadow-sm",
          isOutbound
            ? "rounded-lg rounded-tr-sm bg-primary text-white"
            : "rounded-lg rounded-tl-sm border border-border bg-surface text-text"
        )}
      >
        {isOutbound && message.sender && (
          <p className="mb-0.5 text-xs font-semibold opacity-80">{message.sender.name}</p>
        )}

        {repliedTo && (
          <div
            className={cn(
              "mb-1 rounded border-l-2 px-2 py-1 text-xs opacity-80",
              isOutbound ? "border-white/50" : "border-primary"
            )}
          >
            {repliedTo.body ?? `[${repliedTo.message_type}]`}
          </div>
        )}

        {message.media && (
          <div className="mb-1">
            <MediaPreview conversationId={conversationId} messageId={message.id} media={message.media} />
          </div>
        )}

        {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}

        <div className="mt-0.5 flex items-center justify-end gap-1">
          <span className={cn("text-[10px] leading-none", isOutbound ? "text-white/70" : "text-muted")}>
            {message.sent_at
              ? new Date(message.sent_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
              : ""}
          </span>
          {isOutbound && <StatusTick status={message.status} />}
        </div>
      </div>
    </div>
  );
}

function InternalNotesList({ conversationId }: { conversationId: number }) {
  const { data: notes } = useNoteList({ conversation_id: conversationId });
  if (!notes || notes.length === 0) return null;

  return (
    <div className="space-y-2 border-t border-warning/30 bg-warning/10 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-warning">Internal notes</p>
      {notes.map((note) => (
        <div key={note.id} className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-text">
          <p className="whitespace-pre-wrap break-words">{note.body}</p>
          <p className="mt-1 text-[11px] text-muted">
            {note.author?.name ?? "Unknown"} · {new Date(note.created_at).toLocaleString()}
            {note.is_private && " · private"}
          </p>
        </div>
      ))}
    </div>
  );
}

function HeaderMenu({
  status,
  canClose,
  canReopen,
  onClose,
  onReopen,
  priority,
  canChangePriority,
  onChangePriority,
}: {
  status: string;
  canClose: boolean;
  canReopen: boolean;
  onClose: () => void;
  onReopen: () => void;
  priority: ConversationPriority;
  canChangePriority: boolean;
  onChangePriority: (priority: ConversationPriority) => void;
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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Chat actions"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full p-2 text-muted hover:bg-primary-soft/60 hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        <MoreVertical className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-xl">
          {canChangePriority && (
            <>
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
                Priority
              </p>
              {PRIORITY_OPTIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    onChangePriority(p);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm capitalize text-text hover:bg-primary-soft/50"
                >
                  {p}
                  {p === priority && <span className="text-primary">✓</span>}
                </button>
              ))}
              <div className="my-1 border-t border-border" />
            </>
          )}
          {status === "closed" ? (
            canReopen && (
              <button
                type="button"
                onClick={() => {
                  onReopen();
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-text hover:bg-primary-soft/50"
              >
                Reopen conversation
              </button>
            )
          ) : (
            canClose && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
              >
                Close conversation
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

function Composer({
  conversationId,
  replyTo,
  onClearReply,
  isClosed,
  canReopen,
  onReopen,
}: {
  conversationId: number;
  replyTo: Message | null;
  onClearReply: () => void;
  isClosed: boolean;
  canReopen: boolean;
  onReopen: () => void;
}) {
  const canReply = usePermission("conversations.reply");
  const canCreateNote = usePermission("notes.create");
  const { draft, setDraft, clearDraft } = useComposerDraft(conversationId);
  const { mode, body } = draft;
  const setMode = (next: "reply" | "note") => setDraft({ mode: next });
  const setBody = (next: string) => setDraft({ body: next });
  const [noteError, setNoteError] = useState<string | null>(null);
  const sendMutation = useSendMessage(conversationId);
  const createNote = useCreateNote({ conversation_id: conversationId });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;

    if (mode === "note") {
      setNoteError(null);
      createNote.mutate(
        { conversation_id: conversationId, body: trimmed },
        {
          onSuccess: () => clearDraft(),
          onError: (err) => setNoteError(err instanceof ApiError ? err.message : "Unable to save note."),
        }
      );
      return;
    }

    if (isClosed && canReopen) {
      onReopen();
    }

    sendMutation.mutate(
      { body: trimmed, replied_to_message_id: replyTo?.id ?? null },
      { onSuccess: () => clearDraft() }
    );
    onClearReply();
  };

  if (!canReply && !canCreateNote) {
    return (
      <div className="shrink-0 border-t border-border bg-surface/95 p-4 text-center text-sm text-muted">
        You don&apos;t have permission to reply or add notes in this conversation.
      </div>
    );
  }

  const isNoteMode = mode === "note";

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-border bg-surface px-3 py-2.5"
      >
        {isNoteMode && (
          <p className="mb-2 text-[11px] font-medium text-warning">
            Writing an internal note — only visible to your team, not sent to the customer.
          </p>
        )}

        {!isNoteMode && isClosed && (
          <p className="mb-2 text-[11px] font-medium text-muted">
            {canReopen
              ? "This conversation is closed — sending a reply will reopen it."
              : "This conversation is closed."}
          </p>
        )}

        {!isNoteMode && replyTo && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border-l-2 border-primary bg-primary-soft/40 px-3 py-1.5 text-xs text-text">
            <span className="truncate">
              <span className="font-medium">Replying to:</span> {replyTo.body ?? `[${replyTo.message_type}]`}
            </span>
            <button type="button" onClick={onClearReply} className="ml-2 shrink-0 text-muted hover:text-text">
              ✕
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1 rounded-2xl border px-2 py-1.5",
              isNoteMode ? "border-warning/40 bg-warning/10" : "border-border bg-bg"
            )}
          >
            <button
              type="button"
              title="Emoji picker coming soon"
              className="shrink-0 rounded-full p-1.5 text-muted opacity-60"
            >
              <Smile className="h-5 w-5" />
            </button>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              rows={1}
              placeholder={isNoteMode ? "Write an internal note…" : "Type a message…"}
              className="min-h-[28px] w-full resize-none bg-transparent px-1 py-1 text-sm text-text placeholder:text-muted focus:outline-none"
            />
            <button
              type="button"
              title="Attachments coming soon"
              className="shrink-0 rounded-full p-1.5 text-muted opacity-60"
            >
              <Paperclip className="h-5 w-5" />
            </button>
            {canReply && canCreateNote && (
              <button
                type="button"
                onClick={() => setMode(isNoteMode ? "reply" : "note")}
                title={isNoteMode ? "Switch back to replying to the customer" : "Write an internal note instead"}
                className={cn(
                  "shrink-0 rounded-full p-1.5",
                  isNoteMode ? "bg-warning/20 text-warning" : "text-muted opacity-60 hover:opacity-100"
                )}
              >
                <Lock className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={!body.trim() || sendMutation.isPending || createNote.isPending}
            aria-label={isNoteMode ? "Save note" : "Send message"}
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-sm disabled:opacity-50",
              isNoteMode ? "bg-warning hover:brightness-95" : "bg-primary hover:bg-primary-dark"
            )}
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
        {sendMutation.isError && !isNoteMode && (
          <p className="mt-1.5 text-xs text-danger">Failed to send. It will not silently retry — try again.</p>
        )}
        {noteError && isNoteMode && <p className="mt-1.5 text-xs text-danger">{noteError}</p>}
      </form>
    </>
  );
}

export function ChatPanel({ conversationId }: { conversationId: number }) {
  const { data: conversation } = useConversation(conversationId);
  const { data: messagesPage, isLoading } = useMessages(conversationId);
  const loadOlder = useLoadOlderMessages(conversationId);
  const { close, reopen, markRead, changePriority } = useConversationActions(conversationId);
  const canClose = usePermission("conversations.close");
  const canReopen = usePermission("conversations.reopen");
  const canChangePriority = usePermission("conversations.change_priority");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [isAtTop, setIsAtTop] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasMarkedRead = useRef<number | null>(null);

  // Reset the "near bottom" tracking when switching conversations (render-time reset on
  // prop change, not an effect, so the very first render of a newly opened conversation
  // already treats itself as at-the-bottom instead of inheriting the previous
  // conversation's scroll position for one frame).
  const [trackedConversationId, setTrackedConversationId] = useState<number | null>(null);
  if (trackedConversationId !== conversationId) {
    setTrackedConversationId(conversationId);
    if (!isNearBottom) setIsNearBottom(true);
    if (!isAtTop) setIsAtTop(false);
  }

  const messages = useMemo(() => [...(messagesPage?.data ?? [])].reverse(), [messagesPage]);
  const newestMessageId = messagesPage?.data[0]?.id;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    setIsNearBottom(true);
    setIsAtTop(false);
  }, []);

  const scrollToTop = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: 0, behavior });
    setIsNearBottom(el.scrollHeight <= el.clientHeight + NEAR_BOTTOM_THRESHOLD_PX);
    setIsAtTop(true);
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const distanceFromTop = el.scrollTop;
    setIsNearBottom(distanceFromBottom < NEAR_BOTTOM_THRESHOLD_PX);
    setIsAtTop(distanceFromTop < NEAR_TOP_THRESHOLD_PX);
  }, []);

  useEffect(() => {
    if (conversation && conversation.unread_count > 0 && hasMarkedRead.current !== conversation.unread_count) {
      hasMarkedRead.current = conversation.unread_count;
      markRead.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, conversation?.unread_count]);

  // Scroll to the newest message only when the newest message itself changes AND the
  // reader is already near the bottom - jumping the view while someone is reading older
  // history would be disorienting. Reading further up shows the floating "scroll to
  // newest" button instead (see the button rendered below the message list).
  useEffect(() => {
    if (isNearBottom) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally excludes isNearBottom: it should gate the effect at run time, not re-trigger it on every scroll-position toggle
  }, [newestMessageId]);

  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface">
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="h-5 w-5 rounded-full bg-muted" />
            <div>
              <div className="h-4 w-24 rounded bg-border/60" />
              <div className="mt-1 h-2.5 w-16 rounded bg-border/40" />
            </div>
          </div>
        </div>
        <div className="flex-1 space-y-3 p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 w-2/3 animate-pulse rounded-lg bg-border/60" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-surface">
      <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            href="/inbox"
            aria-label="Back to conversation list"
            className="-ml-1 rounded-full p-2 text-muted hover:bg-primary-soft/60 hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary lg:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          {conversation && <Avatar name={contactLabel(conversation)} size="sm" />}
          <div className="min-w-0">
            <p className="truncate font-semibold text-text">{contactLabel(conversation)}</p>
            <p className="truncate text-xs text-muted">{contactSubtitle(conversation)}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            title="Video call coming soon"
            className="rounded-full p-2 text-muted opacity-50"
          >
            <Video className="h-5 w-5" />
          </button>
          <button
            type="button"
            title="Call coming soon"
            className="rounded-full p-2 text-muted opacity-50"
          >
            <Phone className="h-5 w-5" />
          </button>
          <button
            type="button"
            title="Search in chat coming soon"
            className="rounded-full p-2 text-muted opacity-50"
          >
            <Search className="h-5 w-5" />
          </button>
          <HeaderMenu
            status={conversation?.status ?? "open"}
            canClose={canClose}
            canReopen={canReopen}
            onClose={() => close.mutate()}
            onReopen={() => reopen.mutate()}
            priority={conversation?.priority ?? "normal"}
            canChangePriority={canChangePriority}
            onChangePriority={(p) => changePriority.mutate(p)}
          />
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <section
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full space-y-1.5 overflow-y-auto overflow-x-hidden px-4 py-4 message-list-bg"
        >
          {isAtTop && messagesPage?.meta.has_more && (
            <button
              type="button"
              onClick={() => {
                const cursor = messagesPage.meta.next_cursor;
                if (cursor) loadOlder.mutate(cursor);
              }}
              disabled={loadOlder.isPending}
              className="absolute inset-x-0 mx-auto top-4 z-10 w-max rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted shadow-lg hover:bg-primary-soft/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              {loadOlder.isPending ? "Loading…" : "Load earlier messages"}
            </button>
          )}

          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              No messages yet. Say hello!
            </div>
          )}

          {messages.map((message, index) => {
            const prev = messages[index - 1];
            const showSeparator =
              !prev ||
              (message.sent_at &&
                prev.sent_at &&
                new Date(message.sent_at).toDateString() !== new Date(prev.sent_at).toDateString());
            return (
              <div key={message.id}>
                {showSeparator && message.sent_at && (
                  <div className="my-3 flex justify-center">
                    <span className="rounded-full bg-border/60 px-3 py-1 text-[11px] text-muted">
                      {dateSeparatorLabel(message.sent_at)}
                    </span>
                  </div>
                )}
                <div
                  onDoubleClick={() => setReplyTo(message)}
                  title="Double-click to reply"
                  className="cursor-pointer"
                >
                  <MessageBubble message={message} conversationId={conversationId} allMessages={messages} />
                </div>
              </div>
            );
          })}
        </section>

        {messages.length > 0 && (
          <div className="absolute bottom-4 right-4 z-10 flex flex-col overflow-hidden rounded-full border border-border bg-surface shadow-lg">
            <button
              type="button"
              onClick={() => scrollToTop("smooth")}
              aria-label="Scroll to oldest visible message"
              className={cn(
                "flex h-10 w-10 items-center justify-center text-text hover:bg-primary-soft/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
                isAtTop ? "opacity-50" : ""
              )}
              title="Scroll up"
            >
              <ChevronUp className="h-5 w-5" />
            </button>
            <div className="h-px bg-border" />
            <button
              type="button"
              onClick={() => scrollToBottom("smooth")}
              aria-label="Scroll to newest message"
              className={cn(
                "flex h-10 w-10 items-center justify-center text-text hover:bg-primary-soft/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
                isNearBottom ? "opacity-50" : ""
              )}
              title="Scroll down"
            >
              <ChevronDown className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      {messages.length > 0 && <InternalNotesList conversationId={conversationId} />}

      <Composer
        conversationId={conversationId}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
        isClosed={conversation?.status === "closed"}
        canReopen={canReopen}
        onReopen={() => reopen.mutate()}
      />
    </div>
  );
}
