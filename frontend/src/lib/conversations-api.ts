import { apiClient, unwrap } from "@/lib/api-client";

export type ConversationStatus = "open" | "pending" | "closed";
export type ConversationPriority = "low" | "normal" | "high" | "urgent";

export interface WhatsappContactSummary {
  id: number;
  wa_jid: string;
  push_name: string | null;
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
  created_at: string;
  // The API exposes the Message model's hasOne `media` relationship, so text
  // messages return null and media messages return a single record.
  media: MessageMedia | null;
}

export interface SendMessageQueuedAck {
  dispatchId: number;
  status: "pending" | "processing";
  bullmqJobId: string | null;
}

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
  if (!body.success) {
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
  payload: { body: string; replied_to_message_id?: number | null }
): Promise<Message | SendMessageQueuedAck> {
  return unwrap(
    apiClient.post(`/conversations/${conversationId}/messages`, {
      message_type: "text",
      body: payload.body,
      replied_to_message_id: payload.replied_to_message_id ?? undefined,
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

export async function changeConversationPriority(
  conversationId: number,
  priority: ConversationPriority
): Promise<Conversation> {
  return unwrap(apiClient.patch(`/conversations/${conversationId}/priority`, { priority }));
}

export async function markConversationRead(conversationId: number): Promise<{ conversation_id: number }> {
  return unwrap(apiClient.patch(`/conversations/${conversationId}/read`));
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
