import { apiClient, unwrap } from "@/lib/api-client";

export type ConversationStatus = "open" | "pending" | "closed";
export type ConversationPriority = "low" | "normal" | "high" | "urgent";

export interface WhatsappContactSummary {
  id: number;
  wa_jid: string;
  push_name: string | null;
  /** Saved (address-book) name for this number - preferred over push_name when present. */
  contact_name?: string | null;
  phone_number: string | null;
  profile_picture_url: string | null;
  is_online?: boolean;
  last_seen_at?: string | null;
}

export interface ContactSummary {
  id: number;
  full_name: string | null;
  email: string | null;
  phone_number: string | null;
  profile_picture_url?: string | null;
}

export interface UserSummary {
  id: number;
  name: string;
  email: string;
}

export interface TeamSummary {
  id: number;
  name: string;
}

export interface LabelSummary {
  id: number;
  name: string;
  color_hex?: string | null;
}

export interface Conversation {
  id: number;
  workspace_id: number;
  status: ConversationStatus;
  priority: ConversationPriority;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  assigned_user_id: number | null;
  assigned_team_id: number | null;
  archived_at?: string | null;
  pinned_at?: string | null;
  muted_until?: string | null;
  starred_at?: string | null;
  blocked_at?: string | null;
  reported_at?: string | null;
  whatsapp_contact: WhatsappContactSummary | null;
  contact: ContactSummary | null;
  assigned_user: UserSummary | null;
  assigned_team: TeamSummary | null;
  labels: LabelSummary[];
}

export interface MessageMedia {
  id: number;
  message_id: number;
  mime_type: string;
  file_size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
}

export interface MessageReaction {
  id: number;
  message_id: number;
  whatsapp_contact_id: number | null;
  user_id: number | null;
  emoji: string;
  reacted_at: string;
}

export type MessageStatus = "queued" | "sent" | "delivered" | "read" | "failed";
export type MessageDirection = "inbound" | "outbound";

export interface Message {
  id: number;
  conversation_id: number;
  whatsapp_message_id: string;
  direction: MessageDirection;
  sender_type: "contact" | "user" | "system";
  sender: UserSummary | null;
  message_type: string;
  body: string | null;
  status: MessageStatus;
  replied_to_message_id: number | null;
  sent_at: string | null;
  /** When the recipient's device acknowledged delivery (WhatsApp receipts). */
  delivered_at: string | null;
  /** When the recipient reported reading the message (WhatsApp receipts). */
  read_at: string | null;
  starred_at?: string | null;
  created_at: string;
  // The API exposes the Message model's hasOne `media` relationship, so text
  // messages return null and media messages return a single record.
  media: MessageMedia | null;
  reactions?: MessageReaction[];
}

export interface SendMessageQueuedAck {
  dispatchId: number;
  status: "pending" | "processing";
  bullmqJobId: string | null;
}

/** Metadata returned by POST /conversations/{id}/media (camelCase, echoed back as `media` when sending). */
export interface UploadedMedia {
  storagePath: string;
  mimeType: string;
  fileName: string | null;
  sizeBytes: number;
  checksumSha256: string;
}

/** Snake_case `media` payload the message-send endpoint expects. */
export interface OutboundMedia {
  storage_path: string;
  mime_type: string;
  file_name?: string | null;
  size_bytes?: number;
  checksum_sha256?: string;
}

export type OutboundMessageType = "text" | "image" | "video" | "audio" | "document";

export interface Paginated<T> {
  data: T[];
  meta: {
    page?: number;
    per_page: number;
    total?: number;
    last_page?: number;
    next_cursor?: string | null;
    prev_cursor?: string | null;
    has_more: boolean;
  };
}

export interface ConversationFilters {
  search?: string;
  status?: ConversationStatus;
  priority?: ConversationPriority;
  assigned_to?: "me" | "unassigned" | string;
  team_id?: number;
  label?: string;
  unread?: boolean;
  archived?: boolean;
  starred?: boolean;
  pinned?: boolean;
  groups?: boolean;
  sla_status?: "risk" | "breached";
  deal_stage?: string;
  date_from?: string;
  date_to?: string;
  per_page?: number;
  page?: number;
}

interface PaginatedApiResponse<T> {
  success: boolean;
  message: string;
  data: T[];
  meta?: Paginated<T>["meta"] | null;
}

async function unwrapPaginated<T>(
  promise: Promise<{ data: PaginatedApiResponse<T> }>
): Promise<Paginated<T>> {
  const { data: body } = await promise;
  // Backend omits `success` on 2xx bodies — only an explicit false is a failure.
  if (body.success === false || !body.data) {
    throw new Error(body.message ?? "Request failed");
  }
  return { data: body.data, meta: body.meta ?? { per_page: 0, has_more: false } };
}

export async function fetchConversations(filters: ConversationFilters): Promise<Paginated<Conversation>> {
  return unwrapPaginated<Conversation>(apiClient.get("/conversations", { params: filters }));
}

export async function fetchConversation(id: number): Promise<Conversation> {
  return unwrap(apiClient.get(`/conversations/${id}`));
}

export async function createConversation(contactId: number): Promise<Conversation> {
  return unwrap(apiClient.post('/conversations', { contact_id: contactId }));
}

export async function fetchMessages(
  conversationId: number,
  params: { per_page?: number; cursor?: string } = {}
): Promise<Paginated<Message>> {
  return unwrapPaginated<Message>(
    apiClient.get(`/conversations/${conversationId}/messages`, { params })
  );
}

export async function sendMessage(
  conversationId: number,
  payload: {
    body?: string;
    replied_to_message_id?: number | null;
    message_type?: OutboundMessageType;
    media?: OutboundMedia;
  }
): Promise<Message | SendMessageQueuedAck> {
  return unwrap(
    apiClient.post(`/conversations/${conversationId}/messages`, {
      message_type: payload.message_type ?? "text",
      body: payload.body ?? "",
      replied_to_message_id: payload.replied_to_message_id ?? undefined,
      media: payload.media ?? undefined,
    })
  );
}

export async function uploadMessageMedia(conversationId: number, file: File): Promise<UploadedMedia> {
  const formData = new FormData();
  formData.append("file", file);
  // Explicit multipart Content-Type: without it, apiClient's global
  // application/json default makes axios 1.19's transformRequest convert the
  // FormData to JSON and the backend's `file` rule fails with
  // "The given data was invalid.". Same pattern as the other FormData uploads.
  return unwrap(
    apiClient.post(`/conversations/${conversationId}/media`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
  );
}

export async function assignConversation(
  conversationId: number,
  payload: { assigned_user_id?: number | null; assigned_team_id?: number | null }
): Promise<Conversation> {
  return unwrap(apiClient.patch(`/conversations/${conversationId}/assign`, payload));
}

export async function closeConversation(conversationId: number): Promise<Conversation> {
  return unwrap(apiClient.patch(`/conversations/${conversationId}/close`));
}

export async function reopenConversation(conversationId: number): Promise<Conversation> {
  return unwrap(apiClient.patch(`/conversations/${conversationId}/reopen`));
}

export async function archiveConversation(conversationId: number): Promise<Conversation> {
  return unwrap(apiClient.patch(`/conversations/${conversationId}/archive`));
}

export async function unarchiveConversation(conversationId: number): Promise<Conversation> {
  return unwrap(apiClient.patch(`/conversations/${conversationId}/unarchive`));
}

export async function pinConversation(conversationId: number): Promise<Conversation> {
  return unwrap(apiClient.patch(`/conversations/${conversationId}/pin`));
}

export async function unpinConversation(conversationId: number): Promise<Conversation> {
  return unwrap(apiClient.patch(`/conversations/${conversationId}/unpin`));
}

export async function muteConversation(
  conversationId: number,
  mutedUntil?: string | null
): Promise<Conversation> {
  return unwrap(apiClient.patch(`/conversations/${conversationId}/mute`, mutedUntil ? { muted_until: mutedUntil } : {}));
}

export async function unmuteConversation(conversationId: number): Promise<Conversation> {
  return unwrap(apiClient.patch(`/conversations/${conversationId}/unmute`));
}

export async function starConversation(conversationId: number): Promise<Conversation> {
  return unwrap(apiClient.patch(`/conversations/${conversationId}/star`));
}

export async function unstarConversation(conversationId: number): Promise<Conversation> {
  return unwrap(apiClient.patch(`/conversations/${conversationId}/unstar`));
}

export async function changeConversationPriority(
  conversationId: number,
  priority: ConversationPriority
): Promise<Conversation> {
  return unwrap(apiClient.patch(`/conversations/${conversationId}/priority`, { priority }));
}

export async function markConversationRead(conversationId: number): Promise<{ conversation_id: number }> {
  return unwrap(apiClient.patch(`/conversations/${conversationId}/read`));
}

export async function markConversationUnread(
  conversationId: number
): Promise<{ conversation_id: number; unread_count: number }> {
  return unwrap(apiClient.patch(`/conversations/${conversationId}/unread`));
}

export interface MediaAccess {
  mimeType: string;
  kind: "signed_url" | "local_file";
  url?: string;
  expiresInSeconds?: number;
  filePath?: string;
}

export async function fetchMediaUrl(
  conversationId: number,
  messageId: number,
  mediaId: number
): Promise<MediaAccess> {
  return unwrap(
    apiClient.get(`/conversations/${conversationId}/messages/${messageId}/media/${mediaId}/url`)
  );
}

/**
 * Local-disk dev mode (no S3_BUCKET on the gateway): fetches the raw media
 * bytes through the backend proxy so previews/downloads work without MinIO.
 * The backend streams the gateway's local file after verifying the user can
 * view the owning conversation.
 */
export async function fetchMediaContent(
  conversationId: number,
  messageId: number,
  mediaId: number,
  mimeType: string
): Promise<Blob> {
  const response = await apiClient.get(
    `/conversations/${conversationId}/messages/${messageId}/media/${mediaId}/content`,
    { responseType: "blob" }
  );
  return new Blob([response.data as BlobPart], { type: mimeType });
}

export async function sendTypingIndicator(
  conversationId: number,
  isTyping: boolean
): Promise<void> {
  await apiClient.post(`/conversations/${conversationId}/typing`, { is_typing: isTyping });
}

export async function addReaction(
  conversationId: number,
  messageId: number,
  emoji: string
): Promise<void> {
  await apiClient.post(`/conversations/${conversationId}/messages/${messageId}/reaction`, { emoji });
}

export async function removeReaction(
  conversationId: number,
  messageId: number,
  emoji: string
): Promise<void> {
  await apiClient.delete(`/conversations/${conversationId}/messages/${messageId}/reaction`, {
    data: { emoji },
  });
}

export interface AssignmentHistoryEntry {
  id: number;
  assigned_to_user_id: number | null;
  assigned_to_team_id: number | null;
  assigned_by: string | null;
  assigned_at: string;
  unassigned_at: string | null;
  assigned_to_user: string | null;
  assigned_to_team: string | null;
}

export async function fetchAssignmentHistory(
  conversationId: number
): Promise<AssignmentHistoryEntry[]> {
  return unwrap(apiClient.get(`/conversations/${conversationId}/assignment-history`));
}

export async function revokeMessage(
  conversationId: number,
  messageId: number
): Promise<void> {
  await apiClient.delete(`/conversations/${conversationId}/messages/${messageId}/revoke`);
}

export async function deleteMessageForMe(
  conversationId: number,
  messageId: number
): Promise<void> {
  await apiClient.delete(`/conversations/${conversationId}/messages/${messageId}/delete-for-me`);
}

export async function clearConversationMessages(conversationId: number): Promise<Conversation> {
  return unwrap(apiClient.delete(`/conversations/${conversationId}/messages`));
}

export async function deleteConversation(conversationId: number): Promise<{ conversation_id: number }> {
  return unwrap(apiClient.delete(`/conversations/${conversationId}`));
}

export async function blockConversation(conversationId: number): Promise<Conversation> {
  return unwrap(apiClient.patch(`/conversations/${conversationId}/block`));
}

export async function unblockConversation(conversationId: number): Promise<Conversation> {
  return unwrap(apiClient.patch(`/conversations/${conversationId}/unblock`));
}

export async function reportConversation(
  conversationId: number,
  reason?: string
): Promise<Conversation> {
  return unwrap(apiClient.patch(`/conversations/${conversationId}/report`, { report_reason: reason }));
}

export interface MessageStatusEvent {
  id: number;
  message_id: number;
  status: "queued" | "sending" | "sent" | "delivered" | "read" | "failed";
  error_message?: string | null;
  created_at: string;
}

export async function fetchMessageStatusEvents(
  conversationId: number,
  messageId: number
): Promise<MessageStatusEvent[]> {
  return unwrap(apiClient.get(`/conversations/${conversationId}/messages/${messageId}/status-events`));
}

export interface ReactionGroup {
  emoji: string;
  count: number;
  reactors: Array<{
    user_id: number | null;
    user_name: string;
    reacted_at: string;
  }>;
}

export async function fetchMessageReactions(
  conversationId: number,
  messageId: number
): Promise<ReactionGroup[]> {
  return unwrap(apiClient.get(`/conversations/${conversationId}/messages/${messageId}/reactions`));
}

export interface MessageSearchResult {
  data: Message[];
  meta: {
    current_page: number;
    from: number | null;
    last_page: number;
    per_page: number;
    to: number | null;
    total: number;
  };
}

export async function searchMessages(
  conversationId: number,
  query: string,
  page: number = 1
): Promise<MessageSearchResult> {
  return unwrap(
    apiClient.get(`/conversations/${conversationId}/messages/search`, {
      params: { q: query, page, per_page: 30 },
    })
  );
}

export async function setMessageStarred(
  conversationId: number,
  messageId: number,
  starred: boolean
): Promise<{ message_id: number; starred_at: string | null }> {
  return unwrap(apiClient.patch(`/conversations/${conversationId}/messages/${messageId}/star`, { starred }));
}

export async function forwardMessage(
  conversationId: number,
  messageId: number,
  targetConversationId: number
): Promise<{ message_id: number; whatsapp_message_id: string; target_conversation_id: number }> {
  return unwrap(
    apiClient.post(`/conversations/${conversationId}/messages/${messageId}/forward`, {
      target_conversation_id: targetConversationId,
    })
  );
}

function conversationDisplayName(conversation: Conversation): string {
  return (
    conversation.contact?.full_name ||
    conversation.whatsapp_contact?.contact_name ||
    conversation.whatsapp_contact?.push_name ||
    conversation.whatsapp_contact?.phone_number ||
    `Conversation #${conversation.id}`
  );
}

function messageText(message: Message): string {
  if (message.body?.trim()) return message.body.trim();
  const labels: Record<string, string> = {
    image: "Photo",
    video: "Video",
    audio: "Audio",
    document: "Document",
    sticker: "Sticker",
    location: "Location",
    contact_card: "Contact",
    template: "Template",
    system: "System message",
    unsupported: "Unsupported message",
  };
  return `[${labels[message.message_type] ?? message.message_type}]`;
}

function formatExportTimestamp(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Export chat (mirrors WhatsApp Web's "Export chat"): fetches the full
 * message history (oldest first) and downloads a plain-text .txt file.
 */
export async function exportConversationChat(conversation: Conversation): Promise<void> {
  const lines: string[] = [];
  let cursor: string | undefined;
  let pages = 0;

  do {
    const page = await fetchMessages(conversation.id, { per_page: 100, cursor });
    // fetchMessages returns newest-first; reverse to append oldest-first.
    const oldestFirst = [...page.data].reverse();
    for (const message of oldestFirst) {
      const sender =
        message.direction === "outbound"
          ? "You"
          : conversationDisplayName(conversation);
      lines.push(`[${formatExportTimestamp(message.sent_at ?? message.created_at)}] ${sender}: ${messageText(message)}`);
    }
    cursor = page.meta.next_cursor ?? undefined;
    pages += 1;
    if (pages > 100) break; // hard safety cap
  } while (cursor);

  if (lines.length === 0) {
    lines.push(`[${formatExportTimestamp(new Date().toISOString())}] No messages in this conversation.`);
  }

  const safeName = (conversationDisplayName(conversation) || `conversation-${conversation.id}`)
    .replace(/[^\w\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-");
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeName || "chat"}-${conversation.id}-chat.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export async function generateAiDraft(conversationId: number): Promise<string> {
  const response = await unwrap<{ draft: string }>(
    apiClient.post(`/conversations/${conversationId}/ai-draft`)
  );
  return response.draft;
}
