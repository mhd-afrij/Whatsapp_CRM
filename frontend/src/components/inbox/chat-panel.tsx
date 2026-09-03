"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Ban,
  ChevronDown,
  Clock,
  Copy,
  CornerUpLeft,
  Archive,
  Bot,
  BriefcaseBusiness,
  Download,
  FileText,
  Flag,
  Forward,
  Info,
  Lock,
  Mail,
  Mic,
  MoreVertical,
  Music,
  Paperclip,
  Phone,
  Pin,
  Search,
  Send,
  SmilePlus,
  Sparkles,
  Square,
  StickyNote,
  Tag,
  Trash2,
  UserRound,
  Video,
  Volume2,
  Zap,
  X,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermission } from "@/hooks/use-permission";
import {
  useConversation,
  useConversationActions,
  useForwardMessage,
  useLoadOlderMessages,
  useMessageStar,
  useMessages,
  useSendMessage,
  useTypingIndicator,
  messagesKey,
} from "@/hooks/use-conversations";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCreateNote } from "@/hooks/use-notes";
import { useCreateDeal, useDealPipelines } from "@/hooks/use-deals";
import { useComposerDraft } from "@/hooks/use-composer-draft";
import { useWorkspaceSettings } from "@/hooks/use-workspace-settings";
import { ApiError } from "@/lib/api-client";
import type { ConversationPriority, Message, OutboundMessageType } from "@/lib/conversations-api";
import {
  uploadMessageMedia,
  addReaction,
  removeReaction,
  revokeMessage,
  deleteMessageForMe,
  fetchMediaUrl,
  fetchConversations,
  exportConversationChat,
  generateAiDraft,
} from "@/lib/conversations-api";
import { useAuth } from "@/context/auth-context";
import { MediaPreview } from "./media-preview";
import { MessageReactions } from "./message-reactions";
import { TemplatePicker, parseSlashCommand } from "./template-picker";
import { LabelPicker } from "@/components/labels/label-picker";
import { TypingIndicator } from "./typing-indicator";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/providers/toast-provider";
import { useUsers } from "@/hooks/use-users";
import { PRIORITY_OPTIONS } from "@/components/inbox/priority-selector";
import { formatInboxDateSeparator, formatInboxTime, isSameInboxDay } from "@/lib/time-format";
import { useMessageSearch } from "@/hooks/use-message-search";
import { MessageStatusTick } from "./message/message-status-tick";

const NEAR_BOTTOM_THRESHOLD_PX = 80;
const NEAR_TOP_THRESHOLD_PX = 80;
const COMPOSER_MIN_HEIGHT_PX = 42;
const COMPOSER_MAX_HEIGHT_PX = 120;

/** Broadcast so the chat header's "Add note" action can flip the composer into internal-note mode. */
const COMPOSER_NOTE_MODE_EVENT = "crm:composer-note-mode";

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

/** Quick-set emojis offered by the composer's emoji button. */
const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉", "✅", "🙌", "👋", "🤔"];

function formatRecordTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

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
    conversation.whatsapp_contact?.contact_name ||
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

function mediaTypeLabel(mime: string): string {
  if (mime.startsWith("image/")) return "Photo";
  if (mime.startsWith("video/")) return "Video";
  if (mime.startsWith("audio/")) return "Audio";
  return "Document";
}

/** Compact 36px thumbnail for the reply quote bar — reuses the same signed-URL
 *  query ("media-url") as MediaPreview, so already-loaded media is instant. */
function ReplyMediaThumb({
  conversationId,
  message,
}: {
  conversationId: number;
  message: Message;
}) {
  const media = message.media;
  const isImage = Boolean(media?.mime_type.startsWith("image/"));
  const { data } = useQuery({
    queryKey: ["media-url", conversationId, message.id, media?.id],
    queryFn: () =>
      media ? fetchMediaUrl(conversationId, message.id, media.id) : Promise.resolve(null),
    enabled: isImage,
    staleTime: 60_000,
  });

  if (!media) return null;

  const isVideo = media.mime_type.startsWith("video/");
  const isAudio = media.mime_type.startsWith("audio/");

  if (isImage && data?.kind === "signed_url" && data.url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
      <img
        src={data.url}
        alt=""
        className="h-9 w-9 shrink-0 rounded-lg border border-border object-cover"
      />
    );
  }

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface">
      {isVideo ? (
        <Video className="h-4 w-4 text-muted" />
      ) : isAudio ? (
        <Music className="h-4 w-4 text-muted" />
      ) : (
        <FileText className="h-4 w-4 text-muted" />
      )}
    </div>
  );
}

function MessageActionsMenu({
  message,
  conversationId,
  onReply,
  onJumpToReply,
  onStarToggle,
  onForward,
  onRequestDelete,
}: {
  message: Message;
  conversationId: number;
  onReply: (message: Message) => void;
  onJumpToReply: (messageId: number) => void;
  onStarToggle: (message: Message) => void;
  onForward: (message: Message) => void;
  onRequestDelete: (message: Message) => void;
}) {
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

  return (
    <div ref={ref} className="absolute right-2 top-2 z-10">
      <button
        type="button"
        aria-label="Message actions"
        onClick={() => setOpen((current) => !current)}
        className="rounded-lg border border-white/[0.08] bg-[#111827]/95 p-1.5 text-slate-400 opacity-0 shadow-lg transition hover:bg-white/[0.08] hover:text-slate-100 group-hover:opacity-100 focus:opacity-100"
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
            onClick={() => {
              onForward(message);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg"
          >
            <Forward className="h-4 w-4 text-muted" />
            Forward
          </button>
          <button
            type="button"
            onClick={() => {
              onStarToggle(message);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg"
          >
            <Sparkles className="h-4 w-4 text-muted" />
            {message.starred_at ? "Unstar" : "Star"}
          </button>
          <button
            type="button"
            onClick={copyMessage}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg"
          >
            <Copy className="h-4 w-4 text-muted" />
            Copy text
          </button>
          <button
            type="button"
            onClick={() => {
              onRequestDelete(message);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
          >
            <Trash2 className="h-4 w-4" />
            Delete message
          </button>
        </div>
      )}
    </div>
  );
}

function MessageContextMenu({
  message,
  conversationId,
  onReply,
  onCopy,
  onStarToggle,
  onForward,
  onRetry,
  onRequestDelete,
}: {
  message: Message;
  conversationId: number;
  onReply: (message: Message) => void;
  onCopy: (text: string) => void;
  onStarToggle: (message: Message) => void;
  onForward: (message: Message) => void;
  onRetry: (messageId: number) => void;
  onRequestDelete: (message: Message) => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickaway = (e: MouseEvent) => {
      if (e.target instanceof Node && !(e.target as HTMLElement).closest(".message-context-menu")) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickaway);
    return () => document.removeEventListener("mousedown", handleClickaway);
  }, [open]);

  const handleReply = () => {
    onReply(message);
    setOpen(false);
  };

  const handleCopy = () => {
    const text = message.body?.trim() || `[${message.message_type}]`;
    onCopy(text);
    setOpen(false);
  };

  const canRetry =
    message.direction === "outbound" &&
    message.sender_type === "user" &&
    message.sender?.id === user?.id &&
    message.status === "failed";

  return (
    <div
      className={`absolute pointer-events-none transform transition-opacity opacity-0 rounded-xl border border-border bg-surface py-1 shadow-lg z-40 ${
        open ? "pointer-events-auto opacity-100" : ""
      }`}
      style={{ left: `${x}px`, top: `${y}px` }}
      onClick={(e) => {
        // Click outside closes menu
        setOpen(false);
      }}
    >
      <div
        className="rounded-xl border border-border bg-surface py-1 shadow-lg w-max max-w-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleReply}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg"
        >
          <CornerUpLeft className="h-3.5 w-3.5 text-muted" />
          Reply
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg mt-2"
        >
          <Copy className="h-3.5 w-3.5 text-muted" />
          Copy text
        </button>
        <button
          type="button"
          onClick={() => {
            onForward(message);
            setOpen(false);
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg mt-2"
        >
          <Forward className="h-3.5 w-3.5 text-muted" />
          Forward
        </button>
        {canRetry && (
          <button
            type="button"
            onClick={() => {
              onRetry(message.id);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-primary hover:bg-primary/10"
          >
            <Clock className="h-3.5 w-3.5 text-muted" />
            Retry
          </button>
        )}
        {!canRetry && (
          <button
            type="button"
            onClick={() => {
              onStarToggle(message);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg"
          >
            <Sparkles className="h-3.5 w-3.5 text-muted" />
            {message.starred_at ? "Unstar" : "Star"}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            onRequestDelete(message);
            setOpen(false);
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger/10 mt-2"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete message
        </button>
      </div>
    </div>
  );
}

/**
 * WhatsApp-style delete dialog (mirrors WhatsApp's "Delete message?" prompt):
 * "Delete for everyone" (revoke - only for the user's own outbound messages)
 * or "Delete for me" (hide from this workspace's inbox; the contact's copy is
 * untouched). Rendered at the bubble's top level (outside the z-10 menus) so
 * the fixed backdrop sits above the composer and conversation action menu.
 */
function DeleteMessageDialog({
  message,
  canDeleteForEveryone,
  onDeleteForMe,
  onDeleteForEveryone,
  onClose,
}: {
  message: Message;
  canDeleteForEveryone: boolean;
  onDeleteForMe: (message: Message) => void;
  onDeleteForEveryone: (messageId: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative mx-4 w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl">
        <h3 className="text-base font-semibold text-text">Delete message?</h3>
        <p className="mt-2 text-sm text-muted">
          {canDeleteForEveryone
            ? "Delete this message for everyone in the chat, or just remove it from your inbox?"
            : "This message will only be removed from your inbox. The contact will still have it."}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {canDeleteForEveryone && (
            <button
              type="button"
              onClick={() => {
                onDeleteForEveryone(message.id);
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded-xl border border-border bg-bg px-3 py-2 text-sm text-danger hover:bg-danger/10"
            >
              <XCircle className="h-4 w-4" />
              Delete for everyone
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              onDeleteForMe(message);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-xl border border-border bg-bg px-3 py-2 text-sm text-danger hover:bg-danger/10"
          >
            <Trash2 className="h-4 w-4" />
            Delete for me
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex w-full items-center gap-2 rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text hover:bg-surface"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageHoverBar({
  message,
  onReply,
  onReact,
}: {
  message: Message;
  onReply: (message: Message) => void;
  onReact: (messageId: number, emoji: string, remove: boolean) => void;
}) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const { user } = useAuth();
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showEmojiPicker) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showEmojiPicker]);

  const handleCopy = async () => {
    const text = message.body?.trim() || `[${message.message_type}]`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // silent
    }
  };

  const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

  return (
    <div className="absolute -top-4 left-1 z-10 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      <div className="flex items-center gap-0.5 rounded-xl border border-white/[0.08] bg-[#111827]/95 px-1 shadow-lg backdrop-blur-sm">
        {/* Emoji reaction */}
        <div ref={pickerRef} className="relative">
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-text transition-colors"
            aria-label="React with emoji"
          >
            <SmilePlus className="h-3.5 w-3.5" />
          </button>
          {showEmojiPicker && (
            <div className="absolute bottom-full left-0 mb-2 flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-1 shadow-lg z-30">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    const hasMyReaction = message.reactions?.some(
                      (r) => r.emoji === emoji && r.user_id === Number(user?.id)
                    );
                    onReact(message.id, emoji, Boolean(hasMyReaction));
                    setShowEmojiPicker(false);
                  }}
                  className="h-8 w-8 flex items-center justify-center rounded-full text-lg hover:bg-bg transition-colors"
                  aria-label={`React with ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Reply */}
        <button
          type="button"
          onClick={() => onReply(message)}
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-text transition-colors"
          aria-label="Reply"
        >
          <CornerUpLeft className="h-3.5 w-3.5" />
        </button>
        {/* Copy */}
        <button
          type="button"
          onClick={handleCopy}
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-text transition-colors"
          aria-label="Copy message"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function MessageBubble({
  message,
  conversationId,
  allMessages,
  timeZone,
  isReplyingTo,
  onReply,
  onJumpToMessage,
  onReact,
  onStarToggle,
  onForward,
  onRevoke,
  onDeleteForMe,
}: {
  message: Message;
  conversationId: number;
  allMessages: Message[];
  timeZone?: string | null;
  isReplyingTo?: boolean;
  onReply: (message: Message) => void;
  onJumpToMessage: (messageId: number) => void;
  onReact: (messageId: number, emoji: string, remove: boolean) => void;
  onStarToggle: (message: Message) => void;
  onForward: (message: Message) => void;
  onRevoke: (messageId: number) => void;
  onDeleteForMe: (message: Message) => void;
}) {
  const { user } = useAuth();
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const isOutbound = message.direction === "outbound";
  const repliedTo = message.replied_to_message_id
    ? allMessages.find((item) => item.id === message.replied_to_message_id)
    : null;

  // "Delete for everyone" keeps the same guard as the old Revoke action: only
  // the sender of their own outbound message can revoke it on WhatsApp.
  const canDeleteForEveryone =
    deleteTarget?.direction === "outbound" &&
    deleteTarget?.sender_type === "user" &&
    deleteTarget?.sender?.id === user?.id;

  return (
    <div
      id={`message-${message.id}`}
      className={cn("group relative flex min-w-0", isOutbound ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "w-fit min-w-[76px] max-w-[80%] px-3.5 py-2.5 text-sm shadow-[0_14px_30px_rgba(0,0,0,0.18)]",
          isOutbound
            ? "rounded-[16px_16px_4px_16px] bg-[#005c4b] text-white"
            : "rounded-[16px_16px_16px_4px] bg-[#182233] text-slate-100",
          isReplyingTo
            ? isOutbound
              ? "ring-2 ring-primary-dark/70"
              : "ring-2 ring-primary/50"
            : undefined
        )}
      >
        <MessageHoverBar
          message={message}
          onReply={onReply}
          onReact={onReact}
        />
        <MessageActionsMenu
          message={message}
          conversationId={conversationId}
          onReply={onReply}
          onJumpToReply={onJumpToMessage}
          onStarToggle={onStarToggle}
          onForward={onForward}
          onRequestDelete={setDeleteTarget}
        />

        {isOutbound && message.sender && (
          <p className="mb-0.5 text-xs font-semibold opacity-80">{message.sender.name}</p>
        )}

        {repliedTo && (
          <button
            type="button"
            className={cn(
              // WhatsApp-style quote strip: a subtle tint behind the quoted text
              // (translucent white over the green outbound bubble, a deeper green
              // tint over the soft-green inbound bubble) so it reads as a distinct block.
              "mb-1 block w-full rounded border-l-2 px-2 py-1 text-left text-xs",
              isOutbound ? "border-white/40 bg-white/10" : "border-[#22C55E]/40 bg-white/[0.04]"
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
          {isOutbound && (
            <MessageStatusTick
              status={message.status}
              deliveredAt={message.delivered_at}
              readAt={message.read_at}
            />
          )}
        </div>
      </div>

      {deleteTarget && (
        <DeleteMessageDialog
          message={deleteTarget}
          canDeleteForEveryone={canDeleteForEveryone}
          onDeleteForMe={onDeleteForMe}
          onDeleteForEveryone={onRevoke}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

interface ConfirmDialogConfig {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

function ConfirmDialog({
  config,
  showReason,
  reason,
  onReasonChange,
  onCancel,
}: {
  config: ConfirmDialogConfig;
  showReason: boolean;
  reason: string;
  onReasonChange: (value: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative mx-4 w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl">
        <h3 className="text-base font-semibold text-text">{config.title}</h3>
        <p className="mt-2 text-sm text-muted">{config.message}</p>
        {showReason && (
          <textarea
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="Optional: describe the reason"
            className="mt-3 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary"
            rows={3}
          />
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-border bg-bg px-3 py-1.5 text-sm text-text hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={config.onConfirm}
            className="rounded-xl bg-danger px-3 py-1.5 text-sm font-medium text-white hover:bg-danger-dark"
          >
            {config.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusDropdown({
  status,
  onStatusChange,
}: {
  status: string;
  onStatusChange: (status: "open" | "closed") => void;
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

  const options = [
    { value: "open" as const, label: "Open", color: "bg-primary" },
    { value: "closed" as const, label: "Closed", color: "bg-muted" },
  ];

  const currentStatus = status === "closed" ? "closed" : "open";
  const current = options.find((o) => o.value === currentStatus) ?? options[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-text hover:bg-bg transition-colors"
      >
        <span className={cn("h-2 w-2 rounded-full", current.color)} />
        {current.label}
        <ChevronDown className="h-3 w-3 text-muted" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-36 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onStatusChange(option.value);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg"
            >
              <span className={cn("h-2 w-2 rounded-full", option.color)} />
              {option.label}
              {option.value === currentStatus && <span className="ml-auto text-primary">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AssignDropdown({
  conversation,
  users,
  onAssign,
}: {
  conversation: ReturnType<typeof useConversation>["data"];
  users: Array<{ id: number; name: string }> | undefined;
  onAssign: (userId: number | null) => void;
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

  const assignedName = conversation?.assigned_user_id
    ? users?.find((u) => u.id === conversation.assigned_user_id)?.name || "Assigned"
    : "Unassigned";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-text hover:bg-bg transition-colors"
      >
        <UserRound className="h-3 w-3 text-muted" />
        <span className="max-w-[80px] truncate">{assignedName}</span>
        <ChevronDown className="h-3 w-3 text-muted" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-48 max-h-60 overflow-y-auto rounded-xl border border-border bg-surface py-1 shadow-lg">
          <button
            type="button"
            onClick={() => { onAssign(null); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg"
          >
            Unassign
          </button>
          <div className="my-1 border-t border-border" />
          {(users ?? []).map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => { onAssign(user.id); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg"
            >
              <span className="min-w-0 truncate">{user.name}</span>
              {user.id === conversation?.assigned_user_id && (
                <span className="ml-auto text-primary">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
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
  isBlocked,
  hasUnread,
  canClose,
  canReopen,
  canChangePriority,
  onOpenContactInfo,
  onMarkUnread,
  onExportChat,
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
  onClear,
  onDelete,
  onBlock,
  onUnblock,
  onReport,
}: {
  status: string;
  priority: ConversationPriority;
  isArchived: boolean;
  isPinned: boolean;
  isMuted: boolean;
  isStarred: boolean;
  isBlocked: boolean;
  hasUnread: boolean;
  canClose: boolean;
  canReopen: boolean;
  canChangePriority: boolean;
  onOpenContactInfo?: () => void;
  onMarkUnread: () => void;
  onExportChat: () => void;
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
  onClear: () => void;
  onDelete: () => void;
  onBlock: () => void;
  onUnblock: () => void;
  onReport: (reason?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"clear" | "delete" | "block" | "report" | null>(null);
  const [reportReason, setReportReason] = useState("");
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

  const configs = {
    clear: {
      title: "Clear all messages?",
      message: "This will permanently delete all messages in this conversation. This action cannot be undone.",
      confirmLabel: "Clear",
      onConfirm: () => { onClear(); setConfirmAction(null); setOpen(false); },
    },
    delete: {
      title: "Delete conversation?",
      message: "This will permanently delete this conversation and all its messages. This action cannot be undone.",
      confirmLabel: "Delete",
      onConfirm: () => { onDelete(); setConfirmAction(null); setOpen(false); },
    },
    block: {
      title: "Block this contact?",
      message: "You will no longer receive messages from this contact. You can unblock them later.",
      confirmLabel: "Block",
      onConfirm: () => { onBlock(); setConfirmAction(null); setOpen(false); },
    },
    report: {
      title: "Report this conversation?",
      message: "Flag this conversation for review by an administrator.",
      confirmLabel: "Report",
      onConfirm: () => { onReport(reportReason || undefined); setConfirmAction(null); setReportReason(""); setOpen(false); },
    },
  };

  return (
    <div ref={ref} className="relative">
      {confirmAction && (
        <ConfirmDialog
          config={configs[confirmAction]}
          showReason={confirmAction === "report"}
          reason={reportReason}
          onReasonChange={setReportReason}
          onCancel={() => { setConfirmAction(null); setReportReason(""); }}
        />
      )}
      <button
        type="button"
        aria-label="Conversation actions"
        onClick={() => setOpen((current) => !current)}
        className="rounded-full p-2 text-muted hover:bg-bg hover:text-text"
      >
        <MoreVertical className="h-5 w-5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-2xl border border-border bg-surface py-1 shadow-lg">
          {onOpenContactInfo && (
            <button
              type="button"
              onClick={() => {
                onOpenContactInfo();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg"
            >
              <Info className="h-4 w-4 text-muted" />
              Contact info
            </button>
          )}

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

          <div className="my-1 border-t border-border" />

          {!hasUnread && (
            <button
              type="button"
              onClick={() => {
                onMarkUnread();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg"
            >
              <Mail className="h-4 w-4 text-muted" />
              Mark as unread
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              onExportChat();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg"
          >
            <Download className="h-4 w-4 text-muted" />
            Export chat
          </button>

          <div className="my-1 border-t border-border" />

          {isBlocked ? (
            <button
              type="button"
              onClick={() => { onUnblock(); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg"
            >
              <Ban className="h-4 w-4 text-muted" />
              Unblock contact
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmAction("block")}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg"
            >
              <Ban className="h-4 w-4 text-muted" />
              Block contact
            </button>
          )}
          <button
            type="button"
            onClick={() => setConfirmAction("report")}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg"
          >
            <Flag className="h-4 w-4 text-muted" />
            Report
          </button>

          <div className="my-1 border-t border-border" />

          <button
            type="button"
            onClick={() => setConfirmAction("clear")}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-warning hover:bg-warning/10"
          >
            <Trash2 className="h-4 w-4" />
            Clear all messages
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

          <div className="my-1 border-t border-border" />
          <button
            type="button"
            onClick={() => setConfirmAction("delete")}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
          >
            <Trash2 className="h-4 w-4" />
            Delete conversation
          </button>
        </div>
      )}
    </div>
  );
}

export function Composer({
  conversationId,
  contactName,
  replyTo,
  onClearReply,
  isClosed,
  canReopen,
  onReopen,
}: {
  conversationId: number;
  contactName: string;
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
  const setMode = useCallback((next: "reply" | "note") => setDraft({ mode: next }), [setDraft]);
  const setBody = (next: string) => setDraft({ body: next });
  const { startTyping, stopTyping } = useTypingIndicator(conversationId);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<{ file: File; previewUrl: string | null } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const discardRecordingRef = useRef(false);
  const sendMutation = useSendMessage(conversationId);
  const aiDraftMutation = useMutation({
    mutationFn: () => generateAiDraft(conversationId),
    onSuccess: (draft) => {
      setBody(draft);
      textareaRef.current?.focus();
    },
    onError: (error) => toast(error instanceof ApiError ? error.message : "AI draft is unavailable.", "error"),
  });
  const createNote = useCreateNote({ conversation_id: conversationId });
  const { toast } = useToast();

  const clearAttachment = useCallback(() => {
    setAttachment((current) => {
      if (current?.previewUrl) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return null;
    });
  }, []);

  // Close the emoji picker on outside clicks.
  useEffect(() => {
    if (!showEmojiPicker) return;
    const listener = (event: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener("mousedown", listener);
    return () => document.removeEventListener("mousedown", listener);
  }, [showEmojiPicker]);

  // Let the chat header's "Add note" action flip this composer into internal-note mode.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ conversationId: number }>).detail;
      if (detail?.conversationId !== conversationId) return;
      setMode("note");
      textareaRef.current?.focus();
    };
    window.addEventListener(COMPOSER_NOTE_MODE_EVENT, handler);
    return () => window.removeEventListener(COMPOSER_NOTE_MODE_EVENT, handler);
  }, [conversationId, setMode]);

  // Voice-recording elapsed-time timer while a recording is in flight.
  useEffect(() => {
    if (!isRecording) return;
    const timer = window.setInterval(() => setRecordSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [isRecording]);

  // Tear down an in-flight recording if the composer unmounts mid-recording.
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    },
    []
  );

  const insertEmoji = (emoji: string) => {
    setBody(`${body}${emoji}`);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  const startRecording = async () => {
    if (!("mediaDevices" in navigator) || !navigator.mediaDevices?.getUserMedia) {
      toast("Voice recording isn't supported in this browser.", "error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/webm", "audio/mp4", "audio/ogg"].find((mime) =>
        MediaRecorder.isTypeSupported(mime)
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        if (discardRecordingRef.current) return;
        const mime = recorder.mimeType || mimeType || "audio/ogg";
        if (!ACCEPTED_ATTACHMENT_TYPES.split(",").includes(mime)) {
          toast(
            "Voice notes recorded in this browser (.webm) aren't accepted by WhatsApp. Attach an .ogg, .mp3, or .m4a file instead.",
            "error"
          );
          return;
        }
        const blob = new Blob(chunks, { type: mime });
        if (blob.size > MAX_ATTACHMENT_BYTES) {
          toast("Voice note exceeds the 25 MB upload limit.", "error");
          return;
        }
        const extension = (mime.split("/")[1] ?? "ogg").replace("mp4", "m4a");
        setAttachment({
          file: new File([blob], `voice-note-${Date.now()}.${extension}`, { type: mime }),
          previewUrl: null,
        });
      };
      recorder.start();
      discardRecordingRef.current = false;
      recorderRef.current = recorder;
      streamRef.current = stream;
      setIsRecording(true);
      setRecordSeconds(0);
    } catch {
      toast("Microphone access was denied.", "error");
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
    setIsRecording(false);
  };

  const cancelRecording = () => {
    discardRecordingRef.current = true;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    recorderRef.current = null;
    setIsRecording(false);
    setRecordSeconds(0);
  };

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const nextHeight = Math.min(Math.max(el.scrollHeight, COMPOSER_MIN_HEIGHT_PX), COMPOSER_MAX_HEIGHT_PX);
    el.style.height = `${nextHeight}px`;
  }, [body, mode]);

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
      className="relative z-20 shrink-0 border-t border-white/[0.08] bg-[#0B1220]/98 px-3 py-3 shadow-[0_-18px_42px_rgba(0,0,0,0.28)] backdrop-blur"
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
        <div
          key={replyTo.id}
          className="mb-2 flex items-stretch overflow-hidden rounded-2xl border border-border bg-bg shadow-sm animate-in slide-in-from-bottom-1 fade-in duration-150"
        >
          <div
            className={cn(
              "w-1 shrink-0",
              replyTo.direction === "outbound" ? "bg-primary" : "bg-muted"
            )}
          />
          <div className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2">
            <ReplyMediaThumb conversationId={conversationId} message={replyTo} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-primary">
                {replyTo.direction === "outbound" ? "You" : contactName}
              </p>
              <p className="truncate text-xs text-muted">
                {replyTo.body ??
                  (replyTo.media ? mediaTypeLabel(replyTo.media.mime_type) : `[${replyTo.message_type}]`)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClearReply}
              aria-label="Cancel reply"
              className="shrink-0 rounded-full p-1.5 text-muted transition-colors hover:bg-border/60 hover:text-text"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
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

      {canReply && !isNoteMode && isRecording && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-[#22C55E]/20 bg-[#22C55E]/5 px-3 py-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#FF3B30]" />
          <span className="text-xs font-medium text-slate-100">
            Recording voice note… {formatRecordTime(recordSeconds)}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={cancelRecording}
              aria-label="Discard recording"
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-white/[0.06] hover:text-text"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={stopRecording}
              aria-label="Stop and attach recording"
              className="rounded-lg bg-[#22C55E] p-1.5 text-[#04130A] transition-colors hover:bg-[#16A34A]"
            >
              <Square className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-wrap items-end gap-2 md:flex-nowrap">
        {canReply && canCreateNote && (
          <button
            type="button"
            onClick={() => setMode(isNoteMode ? "reply" : "note")}
            aria-label={isNoteMode ? "Switch to reply mode" : "Switch to internal note mode"}
            className={cn(
              "flex h-[42px] items-center justify-center gap-2 rounded-full border text-xs font-medium",
              isNoteMode
                ? "w-[42px] border-warning bg-warning/10 text-warning"
                : "border-border bg-bg px-3 text-muted hover:text-text"
            )}
          >
            <Lock className="h-3.5 w-3.5" />
            {!isNoteMode && "Reply"}
          </button>
        )}

        {canReply && (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isNoteMode || isUploading || isRecording}
              aria-label="Attach media"
              className={cn(
                "flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-text disabled:cursor-not-allowed disabled:opacity-40",
                attachment && "text-primary"
              )}
            >
              <Paperclip className="h-5 w-5" />
            </button>

            <div className="relative hidden 2xl:block" ref={emojiRef}>
              <button
                type="button"
                onClick={() => setShowEmojiPicker((open) => !open)}
                disabled={isNoteMode || isUploading || isRecording}
                aria-label="Insert emoji"
                aria-expanded={showEmojiPicker}
                className={cn(
                  "flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-text disabled:cursor-not-allowed disabled:opacity-40",
                  showEmojiPicker && "bg-bg text-text"
                )}
              >
                <SmilePlus className="h-5 w-5" />
              </button>
              {showEmojiPicker && (
                <div className="absolute bottom-full left-0 z-30 mb-2 w-64 rounded-xl border border-white/[0.08] bg-surface p-2 shadow-2xl animate-in slide-in-from-bottom-2 fade-in duration-100">
                  <div className="grid grid-cols-8 gap-0.5">
                    {QUICK_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => insertEmoji(emoji)}
                        className="rounded-lg p-1.5 text-lg transition-transform hover:scale-110 hover:bg-white/[0.06]"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowTemplatePicker((open) => !open)}
              disabled={isNoteMode || isUploading || isRecording}
              aria-label="Saved replies"
              aria-expanded={showTemplatePicker}
              className={cn(
                "hidden h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-text disabled:cursor-not-allowed disabled:opacity-40 2xl:flex",
                showTemplatePicker && "bg-bg text-text"
              )}
            >
              <Zap className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={startRecording}
              disabled={isNoteMode || isUploading || isRecording}
              aria-label="Record a voice message"
              className={cn(
                "hidden h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-text disabled:cursor-not-allowed disabled:opacity-40 2xl:flex",
                isRecording && "text-danger"
              )}
            >
              <Mic className="h-5 w-5" />
            </button>
          </>
        )}

        <div className="relative min-w-[220px] flex-1 basis-[260px]">
          {!isNoteMode && showTemplatePicker && (
            <TemplatePicker onSelect={handleTemplateSelect} onClose={() => setShowTemplatePicker(false)} />
          )}
          {!isNoteMode && (
            <button
              type="button"
              onClick={() => aiDraftMutation.mutate()}
              disabled={aiDraftMutation.isPending || isUploading}
              aria-label="Draft a reply with AI"
              title="Draft a reply with AI"
              className="absolute bottom-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-[#22C55E] transition-colors hover:bg-[#22C55E]/10 disabled:cursor-wait disabled:opacity-50"
            >
              <Sparkles className={cn("h-4 w-4", aiDraftMutation.isPending && "animate-pulse")} aria-hidden="true" />
            </button>
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
            className="min-h-[42px] w-full min-w-0 resize-none overflow-hidden rounded-xl border border-white/[0.08] bg-[#080F1D] px-3 py-2.5 pr-12 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-[#22C55E]/60 focus:ring-2 focus:ring-[#22C55E]/20"
          />
        </div>

        <button
          type="submit"
          disabled={(!body.trim() && !attachment) || sendMutation.isPending || createNote.isPending || isUploading}
          aria-label={isNoteMode ? "Save note" : "Send message"}
          className={cn(
            "flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl font-semibold shadow-[0_10px_24px_rgba(34,197,94,0.16)] disabled:opacity-50",
            isNoteMode ? "bg-warning text-[#080F1D] hover:brightness-95" : "bg-[#22C55E] text-[#04130A] hover:bg-[#16A34A]"
          )}
        >
          <Send className="h-5 w-5" />
        </button>
      </div>

      {sendMutation.isError && !isNoteMode && (
        <p className="mt-2 text-xs text-danger">
          {sendMutation.error instanceof ApiError
            ? sendMutation.error.message
            : "Unable to send message. Please try again."}
        </p>
      )}
      {noteError && isNoteMode && <p className="mt-2 text-xs text-danger">{noteError}</p>}
    </form>
  );
}

/**
 * Forward-picker modal (mirrors WhatsApp's "Forward message" dialog):
 * searchable conversation list, click to forward the selected message into
 * that chat.
 */
function ForwardConversationDialog({
  conversationId,
  message,
  onClose,
  onForwarded,
}: {
  conversationId: number;
  message: Message;
  onClose: () => void;
  onForwarded: (targetConversationId: number) => void;
}) {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["conversations", "forward-picker", search],
    queryFn: () => fetchConversations({ search: search || undefined, per_page: 20, page: 1 }),
    staleTime: 30_000,
  });
  const conversations = (data?.data ?? []).filter((conversation) => conversation.id !== conversationId);
  const preview = message.body?.trim() || `[${message.message_type}]`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-text">Forward message</p>
          <p className="mt-0.5 truncate text-xs text-muted">{preview}</p>
        </div>
        <div className="shrink-0 border-b border-border p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="w-full rounded-2xl border border-border bg-bg py-2 pl-9 pr-3 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading && (
            <div className="space-y-2 p-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-12 animate-pulse rounded-xl bg-bg" />
              ))}
            </div>
          )}
          {!isLoading && conversations.length === 0 && (
            <p className="p-4 text-center text-sm text-muted">No conversations found.</p>
          )}
          {conversations.map((conversation) => {
            const name =
              conversation.contact?.full_name ||
              conversation.whatsapp_contact?.contact_name ||
              conversation.whatsapp_contact?.push_name ||
              conversation.whatsapp_contact?.phone_number ||
              `Conversation #${conversation.id}`;
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onForwarded(conversation.id)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-text hover:bg-bg"
              >
                <Avatar name={name} size="sm" />
                <span className="min-w-0 flex-1 truncate">{name}</span>
                <span className="shrink-0 text-xs text-muted">
                  {conversation.status === "closed" ? "Closed" : ""}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function HeaderIconButton({
  icon: Icon,
  label,
  onClick,
  hideOnSmall = false,
}: {
  icon: typeof Search;
  label: string;
  onClick?: () => void;
  hideOnSmall?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-slate-400 transition hover:bg-white/[0.07] hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#22C55E]/30",
        hideOnSmall ? "hidden 2xl:flex" : "flex"
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

export function ChatHeader({
  conversation,
  children,
  onSearch,
  onOpenContactInfo,
  onCall,
  onCreateDeal,
  onAddNote,
}: {
  conversation: ReturnType<typeof useConversation>["data"];
  children: ReactNode;
  onSearch: () => void;
  onOpenContactInfo?: () => void;
  onCall: () => void;
  onCreateDeal: () => void;
  onAddNote: () => void;
}) {
  const online = conversation?.whatsapp_contact?.is_online === true;

  return (
    <header className="flex min-h-[80px] shrink-0 items-center justify-between gap-2 border-b border-white/[0.08] bg-[#0B1220]/95 px-4 py-3 shadow-[0_10px_28px_rgba(0,0,0,0.18)] backdrop-blur">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Link
          href="/inbox"
          aria-label="Back to conversation list"
          className="-ml-1 rounded-xl p-2 text-slate-400 transition hover:bg-white/[0.06] hover:text-slate-100 md:hidden"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        {conversation && <Avatar name={contactLabel(conversation)} size="md" className="rounded-xl" />}
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-base font-semibold text-slate-50">{contactLabel(conversation)}</p>
            <span className="hidden items-center gap-1 rounded-md border border-[#22C55E]/25 bg-[#22C55E]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#86EFAC] sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
              {online ? "Online" : "Active"}
            </span>
          </div>
          <p className="truncate text-xs text-slate-400">{contactSubtitle(conversation)}</p>
        </div>
      </div>

      <div className="flex max-w-[46%] shrink-0 items-center justify-end gap-1.5 overflow-hidden xl:max-w-[56%]">
        <div className="hidden min-w-0 items-center gap-1.5 overflow-hidden 2xl:flex">{children}</div>
        <HeaderIconButton icon={Phone} label="Call customer" onClick={onCall} hideOnSmall />
        <HeaderIconButton icon={Search} label="Search messages" onClick={onSearch} />
        <HeaderIconButton icon={BriefcaseBusiness} label="Create deal" onClick={onCreateDeal} hideOnSmall />
        <HeaderIconButton icon={StickyNote} label="Add note" onClick={onAddNote} hideOnSmall />
        {onOpenContactInfo && <HeaderIconButton icon={Info} label="Open contact info" onClick={onOpenContactInfo} hideOnSmall />}
      </div>
    </header>
  );
}

export function MessageList({
  children,
  scrollRef,
  onScroll,
}: {
  children: ReactNode;
  scrollRef: RefObject<HTMLDivElement | null>;
  onScroll: () => void;
}) {
  return (
    <section
      ref={scrollRef}
      onScroll={onScroll}
      className="message-list-bg min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-5 [scrollbar-color:rgba(148,163,184,.28)_transparent] [scrollbar-width:thin]"
    >
      {children}
    </section>
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
  const { data: messagesPage, isLoading, isError, refetch: refetchMessages } = useMessages(conversationId);
  const { data: workspace } = useWorkspaceSettings();
  const loadOlder = useLoadOlderMessages(conversationId);
  const { close, reopen, markRead, markUnread, changePriority, archive, unarchive, pin, unpin, mute, unmute, star, unstar, clearMessages, deleteConv, block, unblock, report, assign } =
    useConversationActions(conversationId);
  const { isContactTyping, typingName } = useTypingIndicator(conversationId);
  const starMutation = useMessageStar(conversationId);
  const forwardMutation = useForwardMessage(conversationId);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canClose = usePermission("conversations.close");
  const canReopen = usePermission("conversations.reopen");
  const canChangePriority = usePermission("conversations.change_priority");
  const canAssign = usePermission("conversations.assign");
  const canCreateNote = usePermission("notes.create");
  const canManageLabels = usePermission("conversations.reply");
  const createDealMutation = useCreateDeal();
  const { data: pipelines } = useDealPipelines();
  const { data: users } = useUsers();
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [forwardTarget, setForwardTarget] = useState<Message | null>(null);
  const suppressAutoReadUntil = useRef(0);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [isAtTop, setIsAtTop] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAiSummary, setShowAiSummary] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const labelPopoverRef = useRef<HTMLDivElement>(null);
  const { data: searchResults } = useMessageSearch(conversationId, searchQuery);
  const scrollRef = useRef<HTMLDivElement>(null);
  const readMarker = useRef<number | null>(null);
  const [trackedConversationId, setTrackedConversationId] = useState<number | null>(null);
  const pendingScrollHeight = useRef<number | null>(null);
  const pendingOlderLoad = useRef(false);

  const handleCallCustomer = () => {
    const number = conversation?.whatsapp_contact?.phone_number;
    if (!number) {
      toast("No phone number available to call.", "error");
      return;
    }
    toast(`Calling ${contactLabel(conversation)}… (${number})`);
  };

  const handleCreateDeal = () => {
    const contact = conversation?.contact;
    if (!contact?.id) {
      toast("This conversation has no linked contact. Link one from the contact panel first.", "error");
      return;
    }
    const pipeline = pipelines?.find((p) => p.is_default) ?? pipelines?.[0] ?? null;
    const stage = pipeline?.stages?.[0] ?? null;
    if (!pipeline || !stage) {
      toast("No pipeline is configured. Add one in Settings first.", "error");
      return;
    }
    createDealMutation.mutate(
      {
        contact_id: contact.id,
        pipeline_id: pipeline.id,
        pipeline_stage_id: stage.id,
        title: `Deal with ${contactLabel(conversation)}`,
      },
      {
        onSuccess: () => toast("Deal created and linked to this contact.", "success"),
        onError: (error) =>
          toast(error instanceof ApiError ? error.message : "Unable to create deal.", "error"),
      }
    );
  };

  const handleAddNote = () => {
    if (!canCreateNote) {
      toast("You don't have permission to add notes.", "error");
      return;
    }
    window.dispatchEvent(
      new CustomEvent(COMPOSER_NOTE_MODE_EVENT, { detail: { conversationId } })
    );
  };

  useEffect(() => {
    if (!showLabels) return;
    const listener = (event: MouseEvent) => {
      if (labelPopoverRef.current && !labelPopoverRef.current.contains(event.target as Node)) {
        setShowLabels(false);
      }
    };
    document.addEventListener("mousedown", listener);
    return () => document.removeEventListener("mousedown", listener);
  }, [showLabels]);

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

  const handleDeleteForMe = useCallback(
    async (message: Message) => {
      try {
        await deleteMessageForMe(conversationId, message.id);
        // Drop the bubble immediately; the gateway also fans a message.updated
        // with deletedForMeAt so other agents' open chats remove it live.
        queryClient.setQueryData(messagesKey(conversationId), (current: unknown) => {
          const typedCurrent = current as { data: Message[]; meta: Record<string, unknown> } | undefined;
          if (!typedCurrent) return current;
          return {
            ...typedCurrent,
            data: typedCurrent.data.filter((m) => m.id !== message.id),
          };
        });
        toast("Message deleted for me.", "success");
      } catch {
        toast("Unable to delete message.", "error");
      }
    },
    [conversationId, queryClient, toast]
  );

  const handleJumpToMessage = useCallback((messageId: number) => {
    const target = document.getElementById(`message-${messageId}`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const handleStarToggle = useCallback(
    (message: Message) => {
      starMutation.mutate({ messageId: message.id, starred: !message.starred_at });
    },
    [starMutation]
  );

  const handleForward = useCallback((message: Message) => {
    setForwardTarget(message);
  }, []);

  const handleExportChat = useCallback(async () => {
    if (!conversation) return;
    try {
      await exportConversationChat(conversation);
      toast("Chat exported.", "success");
    } catch {
      toast("Unable to export chat.", "error");
    }
  }, [conversation, toast]);

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
      // A manual "Mark as unread" from this panel sets the counter back up;
      // don't immediately auto-clear it (WhatsApp keeps it unread until the
      // chat is reopened).
      if (Date.now() < suppressAutoReadUntil.current) return;
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
      <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[#080F1D]">
        <div className="flex h-16 shrink-0 items-center border-b border-border px-3">
          <div className="h-4 w-28 rounded bg-border/60" />
        </div>
        <div className="message-list-bg flex-1 space-y-3 overflow-hidden p-5">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-10 w-2/3 animate-pulse rounded-2xl bg-border/60" />
          ))}
        </div>
        <div className="shrink-0 border-t border-border bg-surface px-3 py-3">
          <div className="h-11 rounded-2xl bg-bg/80" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[#080F1D]">
        <div className="flex h-16 shrink-0 items-center border-b border-border px-3">
          <div className="h-4 w-28 rounded bg-border/60" />
        </div>
        <div className="message-list-bg flex min-h-0 flex-1 items-center justify-center p-5">
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-danger">Unable to load messages.</p>
            <button
              type="button"
              onClick={() => refetchMessages()}
              className="rounded-full border border-border bg-surface px-4 py-1.5 text-xs text-muted hover:bg-bg"
            >
              Retry
            </button>
          </div>
        </div>
        <div className="shrink-0 border-t border-border bg-surface px-3 py-3">
          <div className="h-11 rounded-2xl bg-bg/80" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[#080F1D]">
      <ChatHeader
        conversation={conversation}
        onSearch={() => setShowSearch((v) => !v)}
        onOpenContactInfo={onOpenContactInfo}
        onCall={handleCallCustomer}
        onCreateDeal={handleCreateDeal}
        onAddNote={handleAddNote}
      >
        <StatusDropdown
          status={conversation?.status ?? "open"}
          onStatusChange={(s) => {
            if (s === "closed") close.mutate();
            else if (conversation?.status === "closed") reopen.mutate();
          }}
        />
        {canAssign && (
          <AssignDropdown
            conversation={conversation}
            users={users}
            onAssign={(userId) => assign.mutate({ assigned_user_id: userId })}
          />
        )}
      </ChatHeader>

      {/* Conversation toolbar: Search · Pin · Label · AI Summary · More */}
      <div className="flex shrink-0 items-center gap-0.5 border-b border-white/[0.08] bg-[#0B1220]/90 px-3 py-1.5 backdrop-blur">
        <button
          type="button"
          onClick={() => setShowSearch((v) => !v)}
          aria-label="Search messages"
          title="Search messages"
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-slate-100",
            showSearch && "bg-white/[0.06] text-slate-100"
          )}
        >
          <Search className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => (conversation?.pinned_at ? unpin.mutate() : pin.mutate())}
          aria-label={conversation?.pinned_at ? "Unpin conversation" : "Pin conversation"}
          title={conversation?.pinned_at ? "Unpin conversation" : "Pin conversation"}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-slate-100",
            conversation?.pinned_at && "text-[#22C55E]"
          )}
        >
          <Pin className={cn("h-4 w-4", conversation?.pinned_at && "rotate-45")} />
        </button>
        <div className="relative" ref={labelPopoverRef}>
          <button
            type="button"
            onClick={() => setShowLabels((v) => !v)}
            aria-label="Labels"
            aria-expanded={showLabels}
            title="Labels"
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-slate-100",
              showLabels && "bg-white/[0.06] text-slate-100"
            )}
          >
            <Tag className="h-4 w-4" />
          </button>
          {showLabels && (
            <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-xl border border-white/[0.08] bg-surface p-3 shadow-2xl">
              <LabelPicker
                entity="conversations"
                entityId={conversationId}
                currentLabels={conversation?.labels}
                canEdit={canManageLabels}
              />
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowAiSummary((v) => !v)}
          aria-label="AI conversation summary"
          aria-expanded={showAiSummary}
          title="AI conversation summary"
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-slate-100",
            showAiSummary && "bg-white/[0.06] text-[#86EFAC]"
          )}
        >
          <Sparkles className="h-4 w-4" />
        </button>
        <div className="ml-auto">
          <ActionMenu
            status={conversation?.status ?? "open"}
            priority={conversation?.priority ?? "normal"}
            isArchived={Boolean(conversation?.archived_at)}
            isPinned={Boolean(conversation?.pinned_at)}
            isMuted={Boolean(conversation?.muted_until && new Date(conversation.muted_until) > new Date())}
            isStarred={Boolean(conversation?.starred_at)}
            isBlocked={Boolean(conversation?.blocked_at)}
            hasUnread={Boolean(conversation && conversation.unread_count > 0)}
            canClose={canClose}
            canReopen={canReopen}
            canChangePriority={canChangePriority}
            onOpenContactInfo={onOpenContactInfo}
            onMarkUnread={() => {
              suppressAutoReadUntil.current = Date.now() + 5000;
              markUnread.mutate();
            }}
            onExportChat={handleExportChat}
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
            onClear={() => clearMessages.mutate()}
            onDelete={() => deleteConv.mutate()}
            onBlock={() => block.mutate()}
            onUnblock={() => unblock.mutate()}
            onReport={(reason) => report.mutate(reason)}
          />
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {showAiSummary && (
          <div className="shrink-0 border-b border-white/[0.08] bg-[#22C55E]/5 px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-[#86EFAC]">
                <Sparkles className="h-3.5 w-3.5" />
                AI summary
              </span>
              <span className="text-xs text-slate-300">
                Customer is interested and likely needs a quotation with follow-up confirmation.
              </span>
              <span className="rounded-md bg-[#080F1D]/70 px-2 py-0.5 text-[11px] text-slate-400">
                Positive
              </span>
              <span className="rounded-md bg-[#080F1D]/70 px-2 py-0.5 text-[11px] text-slate-400">
                Score 82
              </span>
              <span className="rounded-md bg-[#080F1D]/70 px-2 py-0.5 text-[11px] text-amber-200">
                Next: Quote
              </span>
            </div>
          </div>
        )}
        {showSearch && (
          <div className="shrink-0 border-b border-border bg-surface px-3 py-2">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 shrink-0 text-muted" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setShowSearch(false);
                    setSearchQuery("");
                  }
                }}
                placeholder="Search in conversation…"
                className="min-w-0 flex-1 bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => { setSearchQuery(""); }}
                  className="text-muted hover:text-text"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => { setShowSearch(false); setSearchQuery(""); }}
                className="text-muted hover:text-text"
                aria-label="Close search"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {searchResults && searchResults.data.length > 0 && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-border bg-bg">
                {searchResults.data.map((msg) => (
                  <button
                    key={msg.id}
                    type="button"
                    onClick={() => {
                      handleJumpToMessage(msg.id);
                      setShowSearch(false);
                      setSearchQuery("");
                    }}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-primary-soft/40"
                  >
                    <span className="shrink-0 text-[10px] text-muted">
                      {msg.sent_at ? formatInboxTime(msg.sent_at, workspace?.timezone) : ""}
                    </span>
                    <span className="min-w-0 truncate text-text">{msg.body ?? `[${msg.message_type}]`}</span>
                  </button>
                ))}
              </div>
            )}
            {searchQuery.trim() && searchResults && searchResults.data.length === 0 && (
              <p className="mt-2 text-center text-xs text-muted">No messages found.</p>
            )}
          </div>
        )}
        <MessageList scrollRef={scrollRef} onScroll={handleScroll}>
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
                  <div className="my-4 flex justify-center">
                    <span className="rounded-lg border border-white/[0.08] bg-[#111827]/90 px-3 py-1 text-[11px] font-medium text-slate-400 shadow-lg backdrop-blur">
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
                    isReplyingTo={replyTo?.id === message.id}
                    onReply={(item) => setReplyTo(item)}
                    onJumpToMessage={handleJumpToMessage}
                    onReact={handleReact}
                    onStarToggle={handleStarToggle}
                    onForward={handleForward}
                    onRevoke={handleRevoke}
                    onDeleteForMe={handleDeleteForMe}
                  />
                </div>
              </div>
            );
          })}
        </MessageList>

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
        contactName={contactLabel(conversation)}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
        isClosed={conversation?.status === "closed"}
        canReopen={canReopen}
        onReopen={() => reopen.mutate()}
      />

      {forwardTarget && (
        <ForwardConversationDialog
          conversationId={conversationId}
          message={forwardTarget}
          onClose={() => setForwardTarget(null)}
          onForwarded={(targetConversationId) => {
            forwardMutation.mutate(
              { messageId: forwardTarget.id, targetConversationId },
              {
                onSuccess: () => {
                  toast("Message forwarded.", "success");
                  setForwardTarget(null);
                },
                onError: (error) => {
                  toast(error instanceof ApiError ? error.message : "Unable to forward message.", "error");
                },
              }
            );
          }}
        />
      )}
    </div>
  );
}







