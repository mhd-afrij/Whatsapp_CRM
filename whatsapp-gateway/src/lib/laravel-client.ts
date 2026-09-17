import { env } from '../config/env';
import { logger } from '../lib/logger';

export interface NewMessageNotificationPayload {
  workspaceId: number;
  conversationId: number;
  messageId: number;
  messageType: string;
  preview: string | null;
}

export const LARAVEL_NOTIFY_REQUEST_TIMEOUT_MS = 2_000;

/**
 * Best-effort, fire-and-forget hook that tells the Laravel backend a live
 * inbound WhatsApp message was persisted so it can raise a realtime
 * `conversation.new_message` bell notification for the conversation's assignee.
 * The backend relay (`notification.created` via emitEvent) plus the frontend's
 * poll fallback all run on the Laravel side; this is the gateway's only
 * gateway->backend call, so it must never break message ingestion - a dead
 * backend, timeout, or non-2xx response is logged and swallowed. The backend's
 * `conversations:notify-new-messages` poll command stays as an eventual
 * backstop if this call is lost entirely.
 */
export async function notifyNewMessage(payload: NewMessageNotificationPayload): Promise<boolean> {
  const baseUrl = env.LARAVEL_INTERNAL_API_URL.replace(/\/+$/, '');
  const url = `${baseUrl}/whatsapp/messages/notify-new`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Shared-Secret': env.INTERNAL_SHARED_SECRET,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(LARAVEL_NOTIFY_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.warn({ status: response.status, url }, 'Laravel notify-new returned a non-2xx response');
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err, url }, 'Failed to notify Laravel of a new message');
    return false;
  }
}