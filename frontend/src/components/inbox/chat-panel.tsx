"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronDown,
  Clock,
  Copy,
  CornerUpLeft,
  Archive,
  FileText,
  Info,
  Lock,
  MoreVertical,
  Paperclip,
  Pin,
  Send,
  Sparkles,
  Volume2,
  X,
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
  useTypingIndicator,
  messagesKey,
} from "@/hooks/use-conversations";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateNote } from "@/hooks/use-notes";
import { useComposerDraft } from "@/hooks/use-composer-draft";
import { useWorkspaceSettings } from "@/hooks/use-workspace-settings";
import { ApiError } from "@/lib/api-client";
import type { ConversationPriority, Message, OutboundMessageType } from "@/lib/conversations-api";
import { uploadMessageMedia, addReaction, removeReaction, revokeMessage } from "@/lib/conversations-api";
import { useAuth } from "@/context/auth-context";
import { MediaPreview } from "./media-preview";
import { MessageReactions } from "./message-reactions";
import { TemplatePicker, parseSlashCommand } from "./template-picker";
import { TypingIndicator } from "./typing-indicator";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/providers/toast-provider";
import { PRIORITY_OPTIONS } from "@/components/inbox/priority-selector";
import { formatInboxDateSeparator, formatInboxTime, isSameInboxDay } from "@/lib/time-format";

const NEAR_BOTTOM_THRESHOLD_PX = 80;
const NEAR_TOP_THRESHOLD_PX = 80;
const COMPOSER_MIN_HEIGHT_PX = 42;
const COMPOSER_MAX_HEIGHT_PX = 120;

/** Matches the backend MediaController and gateway MEDIA_ALLOWED_MIME_TYPES / MAX_MEDIA_BYTES. */
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const ACCEPTED_ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/3gpp",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
].join(",");

function messageTypeForMime(mime: string): OutboundMessageType {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
  const status =
    conversation.whatsapp_contact?.is_online === true
      ? "online"
      : conversation.status === "open"
        ? "last seen recently"
        : conversation.status;
  return [number, status].filter(Boolean).join(" | ");
}

function StatusTick({ status }: { status: Message["status"] }) {
  if (status === "failed") return <XCircle className="h-3 w-3 text-danger" />;
  if (status === "read") return <CheckCheck className="h-3 w-3 text-info" />;
  if (status === "delivered") return <CheckCheck className="h-3 w-3 text-muted" />;
  if (status === "sent") return <Check className="h-3 w-3 text-muted" />;
  return <Clock className="h-3 w-3 text-muted" />;
}

function MessageActionsMenu({
  message,
  conversationId,
  onReply,
  onJumpToReply,
  onRevoke,
}: {
  message: Message;
  conversationId: number;
  onReply: (message: Message) => void;
  onJumpToReply: (messageId: number) => void;
  onRevoke: (messageId: number) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
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

  const copyMessage = async () => {
    const text = message.body?.trim() || `[${message.message_type}]`;
    try {
      await navigator.clipboard.writeText(text);
      toast("Message copied to clipboard.", "success");
    } catch {
      toast("Unable to copy message.", "error");
    }
    setOpen(false);
  };

  const handleRevoke = () => {
    if (window.confirm("Revoke this message for everyone?")) {
      onRevoke(message.id);
    }
    setOpen(false);
  };

  const canRevoke =
    message.direction === "outbound" &&
    message.sender_type === "user" &&
    message.sender?.id === user?.id;

  return (
    <div ref={ref} className="absolute right-2 top-2 z-10">
      <button
        type="button"
        aria-label="Message actions"
        onClick={() => setOpen((current) => !current)}
        className="rounded-full border border-border bg-surface/95 p-1.5 text-muted shadow-sm opacity-0 transition-opacity hover:text-text group-hover:opacity-100 focus:opacity-100"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-44 overflow-hidden rounded-2xl border border-border bg-surface py-1 shadow-lg">
          <button
            type="button"
            onClick={() => {
              onReply(message);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg"
          >
            <CornerUpLeft className="h-4 w-4 text-muted" />
            Reply
          </button>
          <button
            type="button"
            onClick={() => {
              if (message.replied_to_message_id) {
                onJumpToReply(message.replied_to_message_id);
              }
              setOpen(false);
            }}
            disabled={!message.replied_to_message_id}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40"
          >
            Jump to reply
          </button>
          <button
            type="button"
            onClick={copyMessage}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg"
          >
            <Copy className="h-4 w-4 text-muted" />
            Copy text
          </button>
          {canRevoke && (
            <button
              type="button"
              onClick={handleRevoke}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
            >
              <XCircle className="h-4 w-4" />
              Revoke message
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  message,
  conversationId,
  allMessages,
  timeZone,
  onReply,
  onJumpToMessage,
  onReact,
  onRevoke,
}: {
  message: Message;
  conversationId: number;
  allMessages: Message[];
  timeZone?: string | null;
  onReply: (message: Message) => void;
  onJumpToMessage: (messageId: number) => void;
  onReact: (messageId: number, emoji: string, remove: boolean) => void;
  onRevoke: (messageId: number) => void;
}) {
  const { user } = useAuth();
  const isOutbound = message.direction === "outbound";
  const repliedTo = message.replied_to_message_id
    ? allMessages.find((item) => item.id === message.replied_to_message_id)
    : null;

  return (
    <div id={`message-${message.id}`} className={cn("group relative flex min-w-0", isOutbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "w-fit min-w-[72px] max-w-[84%] rounded-2xl px-3 py-2 text-sm shadow-sm md:max-w-[68%] lg:max-w-[560px]",
          isOutbound
            ? "rounded-tr-sm bg-primary text-white"
            : "rounded-tl-sm border border-border bg-surface text-text"
        )}
      >
        <MessageActionsMenu
          message={message}
          conversationId={conversationId}
          onReply={onReply}
          onJumpToReply={onJumpToMessage}
          onRevoke={onRevoke}
        />

        {isOutbound && message.sender && (
          <p className="mb-0.5 text-xs font-semibold opacity-80">{message.sender.name}</p>
        )}

        {repliedTo && (
          <button
            type="button"
            className={cn(
              "mb-1 block w-full rounded border-l-2 px-2 py-1 text-left text-xs",
              isOutbound ? "border-white/50" : "border-primary"
            )}
            onClick={() => onJumpToMessage(repliedTo.id)}
            title="Jump to replied message"
          >
            {repliedTo.body ?? `[${repliedTo.message_type}]`}
          </button>
        )}

        {message.media && (
          <div className="mb-1">
            <MediaPreview conversationId={conversationId} messageId={message.id} media={message.media} />
          </div>
        )}

        {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}

        <MessageReactions
          reactions={message.reactions}
          currentUserId={user?.id ? Number(user.id) : undefined}
          onAddReaction={(emoji) => onReact(message.id, emoji, false)}
          onRemoveReaction={(emoji) => onReact(message.id, emoji, true)}
        />

        <div className="mt-1 flex items-center justify-end gap-1">
          <span className={cn("text-[10px] leading-none", isOutbound ? "text-white/70" : "text-muted")}>
            {formatInboxTime(message.sent_at, timeZone)}
          </span>
          {isOutbound && <StatusTick status={message.status} />}
        </div>
      </div>
    </div>
  );
}

function ActionMenu({
  status,
  priority,
  isArchived,
  isPinned,
  isMuted,
  isStarred,
  canClose,
  canReopen,
  canChangePriority,
  onArchive,
  onUnarchive,
  onPin,
  onUnpin,
  onMute,
  onUnmute,
  onStar,
  onUnstar,
  onClose,
  onReopen,
  onPriorityChange,
}: {
  status: string;
  priority: ConversationPriority;
  isArchived: boolean;
  isPinned: boolean;
  isMuted: boolean;
  isStarred: boolean;
  canClose: boolean;
  canReopen: boolean;
  canChangePriority: boolean;
  onArchive: () => void;
  onUnarchive: () => void;
  onPin: () => void;
  onUnpin: () => void;
  onMute: () => void;
  onUnmute: () => void;
  onStar: () => void;
  onUnstar: () => void;
  onClose: () => void;
  onReopen: () => void;
  onPriorityChange: (priority: ConversationPriority) => void;
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
        aria-label="Conversation actions"
        onClick={() => setOpen((current) => !current)}
        className="rounded-full p-2 text-muted hover:bg-bg hover:text-text"
      >
        <MoreVertical className="h-5 w-5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-2xl border border-border bg-surface py-1 shadow-lg">
          {canChangePriority && (
            <>
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
                Priority
              </p>
              {PRIORITY_OPTIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    onPriorityChange(item);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm capitalize text-text hover:bg-bg"
                >
                  {item}
                  {item === priority && <span className="text-primary">✓</span>}
                </button>
              ))}
              <div className="my-1 border-t border-border" />
            </>
          )}

          <button
            type="button"
            onClick={() => {
              (isStarred ? onUnstar : onStar)();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg"
          >
            <Sparkles className="h-4 w-4 text-muted" />
            {isStarred ? "Unstar" : "Star"}
          </button>
          <button
            type="button"
            onClick={() => {
              (isPinned ? onUnpin : onPin)();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg"
          >
            <Pin className="h-4 w-4 text-muted" />
            {isPinned ? "Unpin" : "Pin"}
          </button>
          <button
            type="button"
            onClick={() => {
              (isMuted ? onUnmute : onMute)();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg"
          >
            <Volume2 className="h-4 w-4 text-muted" />
            {isMuted ? "Unmute" : "Mute"}
          </button>
          <button
            type="button"
            onClick={() => {
              (isArchived ? onUnarchive : onArchive)();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg"
          >
            <Archive className="h-4 w-4 text-muted" />
            {isArchived ? "Unarchive" : "Archive"}
          </button>

          {status === "closed" ? (
            canReopen && (
              <button
                type="button"
                onClick={() => {
                  onReopen();
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-text hover:bg-bg"
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
  const { startTyping, stopTyping } = useTypingIndicator(conversationId);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<{ file: File; previewUrl: string | null } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendMutation = useSendMessage(conversationId);
  const createNote = useCreateNote({ conversation_id: conversationId });
  const { toast } = useToast();

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const nextHeight = Math.min(Math.max(el.scrollHeight, COMPOSER_MIN_HEIGHT_PX), COMPOSER_MAX_HEIGHT_PX);
    el.style.height = `${nextHeight}px`;
  }, [body, mode]);

  const clearAttachment = useCallback(() => {
    setAttachment((current) => {
      if (current?.previewUrl) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return null;
    });
  }, []);

  const handleTemplateSelect = (content: string) => {
    setBody(content);
    setShowTemplatePicker(false);
    textareaRef.current?.focus();
  };

  const handleTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setBody(value);

    // Send typing indicator when agent types
    if (mode === "reply" && value.trim()) {
      startTyping();
    }

    const slashCmd = parseSlashCommand(value);
    if (slashCmd) {
      setShowTemplatePicker(true);
    } else if (showTemplatePicker) {
      setShowTemplatePicker(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast("File exceeds the 25 MB upload limit.", "error");
      return;
    }
    const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    setAttachment({ file, previewUrl });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    // Stop typing indicator when message is sent
    stopTyping();

    if (mode === "note") {
      const trimmed = body.trim();
      if (!trimmed) return;
      setNoteError(null);
      createNote.mutate(
        { conversation_id: conversationId, body: trimmed },
        {
          onSuccess: () => clearDraft(),
          onError: (error) => setNoteError(error instanceof ApiError ? error.message : "Unable to save note."),
        }
      );
      return;
    }

    if (isClosed && canReopen) {
      onReopen();
    }

    const trimmed = body.trim();
    if (!trimmed && !attachment) return;

    if (attachment) {
      setIsUploading(true);
      try {
        const uploaded = await uploadMessageMedia(conversationId, attachment.file);
        sendMutation.mutate(
          {
            body: trimmed,
            replied_to_message_id: replyTo?.id ?? null,
            message_type: messageTypeForMime(attachment.file.type),
            media: {
              storage_path: uploaded.storagePath,
              mime_type: uploaded.mimeType,
              file_name: uploaded.fileName,
              size_bytes: uploaded.sizeBytes,
              checksum_sha256: uploaded.checksumSha256,
            },
          },
          {
            onSuccess: () => {
              clearDraft();
              clearAttachment();
            },
          }
        );
      } catch (error) {
        toast(error instanceof ApiError ? error.message : "Unable to upload attachment. Please try again.", "error");
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    } else {
      sendMutation.mutate(
        { body: trimmed, replied_to_message_id: replyTo?.id ?? null },
        { onSuccess: () => clearDraft() }
      );
    }
    onClearReply();
  };

  if (!canReply && !canCreateNote) {
    return (
      <div className="border-t border-border bg-surface px-4 py-3 text-center text-sm text-muted">
        You do not have permission to reply or add notes in this conversation.
      </div>
    );
  }

  const isNoteMode = mode === "note";

  return (
    <form
      onSubmit={handleSubmit}
      className="sticky bottom-0 z-20 border-t border-border bg-surface px-3 pt-3 pb-[max(10px,env(safe-area-inset-bottom))]"
    >
      {isNoteMode && (
        <p className="mb-2 text-xs font-medium text-warning">
          Internal note mode. Only your team can see this.
        </p>
      )}

      {!isNoteMode && isClosed && (
        <p className="mb-2 text-xs font-medium text-muted">
          {canReopen ? "This conversation is closed. Sending a reply will reopen it." : "This conversation is closed."}
        </p>
      )}

      {!isNoteMode && replyTo && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl border border-border bg-bg px-3 py-2 text-xs text-text">
          <span className="truncate">
            <span className="font-medium">Replying to:</span> {replyTo.body ?? `[${replyTo.message_type}]`}
          </span>
          <button type="button" onClick={onClearReply} className="shrink-0 text-muted hover:text-text">
            ×
          </button>
        </div>
      )}

      {!isNoteMode && attachment && (
        <div className="mb-2 flex items-center gap-2 rounded-2xl border border-border bg-bg px-3 py-2 text-xs text-text">
          {attachment.previewUrl ? (
            <img
              src={attachment.previewUrl}
              alt="Attachment preview"
              className="h-10 w-10 shrink-0 rounded-lg border border-border object-cover"
            />
          ) : (
            <FileText className="h-5 w-5 shrink-0 text-muted" />
          )}
          <span className="min-w-0 flex-1 truncate">{attachment.file.name}</span>
          <span className="shrink-0 text-muted">{formatBytes(attachment.file.size)}</span>
          <button
            type="button"
            onClick={clearAttachment}
            aria-label="Remove attachment"
            className="shrink-0 text-muted hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_ATTACHMENT_TYPES}
        className="hidden"
        onChange={handleFileSelect}
      />

      <div
        className={cn(
          "grid items-end gap-2",
          canReply && canCreateNote
            ? "grid-cols-[auto_auto_minmax(0,1fr)_42px]"
            : canReply
              ? "grid-cols-[auto_minmax(0,1fr)_42px]"
              : "grid-cols-[minmax(0,1fr)_42px]"
        )}
      >
        {canReply && canCreateNote && (
          <button
            type="button"
            onClick={() => setMode(isNoteMode ? "reply" : "note")}
            className={cn(
              "flex h-[42px] items-center gap-2 rounded-full border px-3 text-xs font-medium",
              isNoteMode ? "border-warning bg-warning/10 text-warning" : "border-border bg-bg text-muted hover:text-text"
            )}
          >
            <Lock className="h-3.5 w-3.5" />
            {isNoteMode ? "Note" : "Reply"}
          </button>
        )}

        {canReply && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isNoteMode || isUploading}
            aria-label="Attach media"
            className={cn(
              "flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-text disabled:cursor-not-allowed disabled:opacity-40",
              attachment && "text-primary"
            )}
          >
            <Paperclip className="h-5 w-5" />
          </button>
        )}

        <div className="relative">
          {!isNoteMode && showTemplatePicker && (
            <TemplatePicker onSelect={handleTemplateSelect} onClose={() => setShowTemplatePicker(false)} />
          )}
          <textarea
            ref={textareaRef}
            value={body}
            onChange={handleTextareaChange}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSubmit(event);
              }
            }}
            rows={1}
            placeholder={isNoteMode ? "Write an internal note" : "Type a message or / for saved replies"}
            className="min-h-[42px] w-full min-w-0 resize-none overflow-hidden rounded-2xl border border-border bg-bg px-3 py-2.5 pr-4 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <button
          type="submit"
          disabled={(!body.trim() && !attachment) || sendMutation.isPending || createNote.isPending || isUploading}
          aria-label={isNoteMode ? "Save note" : "Send message"}
          className={cn(
            "flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-white disabled:opacity-50",
            isNoteMode ? "bg-warning hover:brightness-95" : "bg-primary hover:bg-primary-dark"
          )}
        >
          <Send className="h-5 w-5" />
        </button>
      </div>

      {sendMutation.isError && !isNoteMode && (
        <p className="mt-2 text-xs text-danger">Unable to send message. Please try again.</p>
      )}
      {noteError && isNoteMode && <p className="mt-2 text-xs text-danger">{noteError}</p>}
    </form>
  );
}

export function ChatPanel({
  conversationId,
  onOpenContactInfo,
}: {
  conversationId: number;
  onOpenContactInfo?: () => void;
}) {
  const { data: conversation } = useConversation(conversationId);
  const { data: messagesPage, isLoading } = useMessages(conversationId);
  const { data: workspace } = useWorkspaceSettings();
  const loadOlder = useLoadOlderMessages(conversationId);
  const { close, reopen, markRead, changePriority, archive, unarchive, pin, unpin, mute, unmute, star, unstar } =
    useConversationActions(conversationId);
  const { isContactTyping, typingName } = useTypingIndicator(conversationId);
  const queryClient = useQueryClient();
  const canClose = usePermission("conversations.close");
  const canReopen = usePermission("conversations.reopen");
  const canChangePriority = usePermission("conversations.change_priority");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [isAtTop, setIsAtTop] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const readMarker = useRef<number | null>(null);
  const [trackedConversationId, setTrackedConversationId] = useState<number | null>(null);
  const pendingScrollHeight = useRef<number | null>(null);
  const pendingOlderLoad = useRef(false);

  const handleReact = useCallback(
    async (messageId: number, emoji: string, remove: boolean) => {
      try {
        if (remove) {
          await removeReaction(conversationId, messageId, emoji);
        } else {
          await addReaction(conversationId, messageId, emoji);
        }
        // Invalidate messages to refresh reactions
        queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) });
      } catch {
        // Reactions are best-effort
      }
    },
    [conversationId, queryClient]
  );

  const handleRevoke = useCallback(
    async (messageId: number) => {
      try {
        await revokeMessage(conversationId, messageId);
        // Invalidate messages to refresh
        queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) });
      } catch {
        // Revokes are best-effort
      }
    },
    [conversationId, queryClient]
  );

  const handleJumpToMessage = useCallback((messageId: number) => {
    const target = document.getElementById(`message-${messageId}`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  if (trackedConversationId !== conversationId) {
    setTrackedConversationId(conversationId);
    if (!isNearBottom) setIsNearBottom(true);
    if (!isAtTop) setIsAtTop(false);
  }

  const messages = useMemo(() => [...(messagesPage?.data ?? [])].reverse(), [messagesPage]);
  const newestMessageId = messagesPage?.data[0]?.id;
  const hasOlderMessages = Boolean(messagesPage?.meta.has_more && messagesPage?.meta.next_cursor);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior });
    setIsNearBottom(true);
    setIsAtTop(false);
  }, []);

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    setIsNearBottom(distanceFromBottom < NEAR_BOTTOM_THRESHOLD_PX);
    setIsAtTop(element.scrollTop < NEAR_TOP_THRESHOLD_PX);
  }, []);

  const handleLoadOlder = useCallback(() => {
    const element = scrollRef.current;
    const cursor = messagesPage?.meta.next_cursor;
    if (!cursor) return;
    if (element) {
      pendingScrollHeight.current = element.scrollHeight;
    }
    pendingOlderLoad.current = true;
    loadOlder.mutate(cursor);
  }, [loadOlder, messagesPage?.meta.next_cursor]);

  useEffect(() => {
    if (conversation && conversation.unread_count > 0 && readMarker.current !== conversation.unread_count) {
      readMarker.current = conversation.unread_count;
      markRead.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, conversation?.unread_count]);

  useEffect(() => {
    if (isNearBottom) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestMessageId]);

  useEffect(() => {
    if (!loadOlder.isError) return;
    pendingScrollHeight.current = null;
    pendingOlderLoad.current = false;
  }, [loadOlder.isError]);

  useLayoutEffect(() => {
    if (!pendingOlderLoad.current) return;
    const element = scrollRef.current;
    if (!element || pendingScrollHeight.current == null) return;
    const previousHeight = pendingScrollHeight.current;
    const nextTop = element.scrollHeight - previousHeight + element.scrollTop;
    element.scrollTop = nextTop;
    pendingScrollHeight.current = null;
    pendingOlderLoad.current = false;
  }, [messages.length]);

  if (isLoading) {
    return (
      <div className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-surface">
        <div className="flex h-16 items-center border-b border-border px-3">
          <div className="h-4 w-28 rounded bg-border/60" />
        </div>
        <div className="space-y-3 overflow-hidden p-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-10 w-2/3 animate-pulse rounded-2xl bg-bg" />
          ))}
        </div>
        <div className="border-t border-border bg-surface px-3 py-3">
          <div className="h-11 rounded-2xl bg-bg/80" />
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-surface">
      <header className="flex h-16 items-center justify-between gap-2 border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            href="/inbox"
            aria-label="Back to conversation list"
            className="-ml-1 rounded-full p-2 text-muted hover:bg-bg hover:text-text md:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          {conversation && <Avatar name={contactLabel(conversation)} size="sm" />}
          <div className="min-w-0">
            <p className="truncate font-semibold text-text">{contactLabel(conversation)}</p>
            <p className="truncate text-xs text-muted">{contactSubtitle(conversation)}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {onOpenContactInfo && (
            <button
              type="button"
              onClick={onOpenContactInfo}
              className="rounded-full p-2 text-muted hover:bg-bg hover:text-text xl:hidden"
              aria-label="Open contact info"
            >
              <Info className="h-5 w-5" />
            </button>
          )}
          <ActionMenu
            status={conversation?.status ?? "open"}
            priority={conversation?.priority ?? "normal"}
            isArchived={Boolean(conversation?.archived_at)}
            isPinned={Boolean(conversation?.pinned_at)}
            isMuted={Boolean(conversation?.muted_until && new Date(conversation.muted_until) > new Date())}
            isStarred={Boolean(conversation?.starred_at)}
            canClose={canClose}
            canReopen={canReopen}
            canChangePriority={canChangePriority}
            onArchive={() => archive.mutate()}
            onUnarchive={() => unarchive.mutate()}
            onPin={() => pin.mutate()}
            onUnpin={() => unpin.mutate()}
            onMute={() => mute.mutate(undefined)}
            onUnmute={() => unmute.mutate()}
            onStar={() => star.mutate()}
            onUnstar={() => unstar.mutate()}
            onClose={() => close.mutate()}
            onReopen={() => reopen.mutate()}
            onPriorityChange={(priority) => changePriority.mutate(priority)}
          />
        </div>
      </header>

      <div className="relative min-h-0 overflow-hidden">
        <section
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full min-h-0 overflow-y-auto overflow-x-hidden px-4 py-4"
        >
          {isAtTop && hasOlderMessages && (
            <div className="sticky top-0 z-10 mb-4 flex justify-center">
              <button
                type="button"
                onClick={handleLoadOlder}
                disabled={loadOlder.isPending}
                className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted hover:bg-bg"
              >
                {loadOlder.isPending ? "Loading..." : "Load earlier messages"}
              </button>
            </div>
          )}

          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              No messages yet. Say hello.
            </div>
          )}

          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const showSeparator = !previous || Boolean(
              message.sent_at &&
                previous.sent_at &&
                !isSameInboxDay(message.sent_at, previous.sent_at, workspace?.timezone)
            );

            return (
              <div key={message.id}>
                {showSeparator && message.sent_at && (
                  <div className="my-3 flex justify-center">
                    <span className="rounded-full bg-bg px-3 py-1 text-[11px] text-muted">
                      {formatInboxDateSeparator(message.sent_at, workspace?.timezone)}
                    </span>
                  </div>
                )}
                <div
                  role="button"
                  tabIndex={0}
                  onDoubleClick={() => setReplyTo(message)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setReplyTo(message);
                    }
                  }}
                  title="Double-click or press Enter to reply"
                  className="w-full text-left outline-none"
                >
                  <MessageBubble
                    message={message}
                    conversationId={conversationId}
                    allMessages={messages}
                    timeZone={workspace?.timezone}
                    onReply={(item) => setReplyTo(item)}
                    onJumpToMessage={handleJumpToMessage}
                    onReact={handleReact}
                    onRevoke={handleRevoke}
                  />
                </div>
              </div>
            );
          })}
        </section>

        <TypingIndicator isTyping={isContactTyping} name={typingName} />

        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => scrollToBottom("smooth")}
            aria-label="Scroll to newest message"
            className={cn(
              "absolute bottom-4 right-4 rounded-full border border-border bg-surface p-2 shadow-lg",
              isNearBottom && "opacity-50"
            )}
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        )}
      </div>

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
