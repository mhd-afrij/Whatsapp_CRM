import type { Conversation } from "@/lib/conversations-api";

/**
 * Qualification logic for the realtime "new message" alert (toast + chime +
 * browser notification). Kept as a pure module so it can be unit-tested without
 * a socket/inbox. Mirrors the backend bell semantics (`conversation.new_message`
 * notifications only reach the conversation's assignee) so the toast and the
 * bell badge always agree about whether a message is "for you".
 *
 * Rules, in order:
 *   1. inbound only (your own outgoing sends never alert)
 *   2. never alert for the conversation you are currently viewing
 *   3. respect the per-user `in_app_enabled` preference for conversation.new_message
 *   4. respect assignment: alert only when the row is assigned to me
 *      (matches NotificationService/NotifyNewMessagesOnAssignedConversations)
 *   5. respect conversation mute (muted_until in the future)
 *   6. dedupe on message id + throttle per conversation (deduping/throttling
 *      itself lives in the provider, which owns the refs)
 */
export const NEW_MESSAGE_ALERT_THROTTLE_MS = 10_000;

export type AlertReason =
  | "not_inbound"
  | "active_conversation"
  | "preference_disabled"
  | "unknown_conversation"
  | "not_assigned_to_me"
  | "muted"
  | "skipped";

export type AlertDecision = { alert: true } | { alert: false; reason: AlertReason };

export interface MessageAlertInput {
  message: {
    id: number;
    conversationId?: number;
    conversation_id?: number;
    direction?: string;
  };
  /** Full conversation row (assigned_user_id, muted_until, contact names…). */
  conversation: Conversation | undefined;
  currentUserId: number;
  /** `in_app_enabled` preference for `conversation.new_message` (default true). */
  inAppEnabled: boolean;
  /** Conversation currently open in the inbox, if any. */
  activeConversationId: number | null;
}

export function conversationIdOf(message: MessageAlertInput["message"]): number | undefined {
  return message.conversationId ?? message.conversation_id;
}

export function decideAlert(input: MessageAlertInput): AlertDecision {
  const { message, conversation, currentUserId, inAppEnabled, activeConversationId } = input;

  if (message.direction !== "inbound") {
    return { alert: false, reason: "not_inbound" };
  }

  const conversationId = conversationIdOf(message);
  if (conversationId != null && activeConversationId != null && conversationId === activeConversationId) {
    return { alert: false, reason: "active_conversation" };
  }

  if (!inAppEnabled) {
    return { alert: false, reason: "preference_disabled" };
  }

  if (!conversation) {
    return { alert: false, reason: "unknown_conversation" };
  }

  if (conversation.assigned_user_id !== currentUserId) {
    return { alert: false, reason: "not_assigned_to_me" };
  }

  if (conversation.muted_until && new Date(conversation.muted_until).getTime() > Date.now()) {
    return { alert: false, reason: "muted" };
  }

  return { alert: true };
}

/** `/inbox` and `/inbox/{id}` → the currently open conversation (null for the list view). */
export function resolveActiveConversationId(pathname: string): number | null {
  const match = pathname.match(/^\/inbox\/(\d+)/);
  return match ? Number(match[1]) : null;
}

/** Best available display name for the contact behind a conversation. */
export function contactNameFor(conversation: Conversation | undefined): string {
  const waName = conversation?.whatsapp_contact?.contact_name ?? conversation?.whatsapp_contact?.push_name;
  const crmName = conversation?.contact?.full_name;
  return waName ?? crmName ?? "New WhatsApp message";
}