"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { useSocket } from "@/providers/socket-provider";
import { useToast } from "@/providers/toast-provider";
import {
  fetchConversation,
  type Conversation,
  type Message,
  type MessageMedia,
} from "@/lib/conversations-api";
import { fetchNotificationPreferences } from "@/lib/notifications-api";
import {
  NEW_MESSAGE_ALERT_THROTTLE_MS,
  contactNameFor,
  conversationIdOf,
  decideAlert,
  resolveActiveConversationId,
} from "@/lib/message-alert";

const NEW_MESSAGE_PREF_TYPE = "conversation.new_message";
const MAX_CACHED_CONVERSATIONS = 200;

interface MessageCreatedPayload {
  message: {
    id: number;
    conversationId?: number;
    conversation_id?: number;
    direction?: "inbound" | "outbound" | string;
    body?: string | null;
    messageType?: string;
    media?: MessageMedia[] | null;
  };
  conversation?: { id: number; lastMessagePreview?: string | null } | null;
}

interface ConversationMetaCacheEntry {
  conversation: Conversation;
  fetchedAt: number;
}

let sharedAudioContext: AudioContext | null = null;

/** Short synthesized two-tone chime (no audio asset required). Best-effort. */
function playChime(): void {
  if (typeof window === "undefined") return;
  try {
    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    sharedAudioContext = sharedAudioContext ?? new AudioContextCtor();
    const ctx = sharedAudioContext;
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1174.66, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.6);
  } catch {
    // Sound is best-effort; never let a chime failure surface to the user.
  }
}

function browserNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/**
 * Shows a native browser notification. `requestPermission` must be triggered by
 * a user gesture in most browsers, so this only ever *displays* when permission
 * is already granted; when it's "default" we request it lazily on the next event
 * (the Settings → Notifications page provides the explicit opt-in button).
 */
function showBrowserNotification(
  title: string,
  body: string,
  conversationId: number,
  onOpen: () => void,
): void {
  if (!browserNotificationSupported()) return;
  if (Notification.permission === "denied") return;

  const fire = () => {
    if (Notification.permission !== "granted") return;
    const notification = new Notification(title, {
      body,
      tag: `conversation.new-message.${conversationId}`,
      silent: true,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
      onOpen();
    };
  };

  if (Notification.permission === "granted") {
    fire();
  } else {
    void Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        fire();
      }
    });
  }
}

/**
 * Realtime "new message" alerting: when the gateway fans out a `message.created`
 * for an inbound message on a conversation assigned to the current agent, surface
 * it as an in-app toast + chime and - when the tab is hidden - a native browser
 * notification that opens the chat on click. The backend's own
 * `conversation.new_message` bell row is raised separately by the gateway's
 * notifyNewMessage hook; this hook only handles the immediate on-screen UX.
 */
function useMessageAlert(): void {
  const { socket } = useSocket();
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();

  const conversationMetaCacheRef = useRef<Map<number, ConversationMetaCacheEntry>>(new Map());
  const alertedMessageIdsRef = useRef<Set<number>>(new Set());
  const lastAlertAtByConversationRef = useRef<Map<number, number>>(new Map());
  const inAppEnabledRef = useRef(true);

  useEffect(() => {
    let cancelled = false;
    void fetchNotificationPreferences()
      .then((prefs) => {
        if (cancelled) return;
        const row = prefs.find((pref) => pref.notification_type === NEW_MESSAGE_PREF_TYPE);
        inAppEnabledRef.current = row ? row.in_app_enabled : true;
      })
      .catch(() => {
        // Default (enabled) on failure; the bell/dropdown polling still applies prefs.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadConversation = useCallback(async (conversationId: number): Promise<Conversation | undefined> => {
    const cache = conversationMetaCacheRef.current;
    const cached = cache.get(conversationId);
    if (cached && Date.now() - cached.fetchedAt < 60_000) {
      return cached.conversation;
    }
    try {
      const conversation = await fetchConversation(conversationId);
      if (cache.size >= MAX_CACHED_CONVERSATIONS) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey !== undefined) cache.delete(oldestKey);
      }
      cache.set(conversationId, { conversation, fetchedAt: Date.now() });
      return conversation;
    } catch {
      cache.delete(conversationId);
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (!socket || !user) return;

    const currentUserId = Number(user.id);
    if (!Number.isFinite(currentUserId)) return;

    const handleMessageCreated = (payload: MessageCreatedPayload) => {
      const conversationId = conversationIdOf(payload.message);
      if (conversationId == null) return;

      const activeConversationId = resolveActiveConversationId(window.location.pathname);

      // Dedupe on message id (socket reconnects can re-deliver the same message).
      if (alertedMessageIdsRef.current.has(payload.message.id)) return;
      if (alertedMessageIdsRef.current.size >= 1000) {
        alertedMessageIdsRef.current.clear();
      }

      const lastAlertAt = lastAlertAtByConversationRef.current.get(conversationId) ?? 0;
      if (Date.now() - lastAlertAt < NEW_MESSAGE_ALERT_THROTTLE_MS) {
        alertedMessageIdsRef.current.add(payload.message.id);
        return;
      }

      void (async () => {
        const conversation = await loadConversation(conversationId);
        const decision = decideAlert({
          message: payload.message,
          conversation,
          currentUserId,
          inAppEnabled: inAppEnabledRef.current,
          activeConversationId,
        });

        if (!decision.alert) return;

        alertedMessageIdsRef.current.add(payload.message.id);
        lastAlertAtByConversationRef.current.set(conversationId, Date.now());

        const name = contactNameFor(conversation);
        const preview =
          payload.message.body?.trim() ??
          payload.conversation?.lastMessagePreview?.trim() ??
          (payload.message.messageType ? `[${payload.message.messageType}]` : "");
        const messageText = preview ? `${name}: ${preview}` : name;

        toast(messageText, "info");
        playChime();

        const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
        if (hidden) {
          showBrowserNotification(name, preview || "New message", conversationId, () => {
            router.push(`/inbox/${conversationId}`);
          });
        }
      })();
    };

    socket.on("message.created", handleMessageCreated);
    return () => {
      socket.off("message.created", handleMessageCreated);
    };
  }, [socket, user, toast, router, loadConversation, pathname]);
}

export function MessageAlertProvider({ children }: { children: ReactNode }) {
  useMessageAlert();
  return <>{children}</>;
}

export type { Message, MessageMedia };