"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { useSocket } from "@/providers/socket-provider";
import { useAuth } from "@/context/auth-context";
import {
  archiveConversation,
  assignConversation,
  blockConversation,
  changeConversationPriority,
  clearConversationMessages,
  closeConversation,
  createConversation,
  deleteConversation,
  fetchConversation,
  fetchConversations,
  fetchMessages,
  markConversationRead,
  muteConversation,
  pinConversation,
  reopenConversation,
  reportConversation,
  sendTypingIndicator,
  starConversation,
  sendMessage,
  unarchiveConversation,
  unblockConversation,
  unmuteConversation,
  unpinConversation,
  unstarConversation,
  type Conversation,
  type ConversationFilters,
  type ConversationPriority,
  type Message,
  type OutboundMedia,
  type OutboundMessageType,
  type SendMessageQueuedAck,
} from "@/lib/conversations-api";

export const conversationsKey = (filters: ConversationFilters) => ["conversations", filters] as const;
export const conversationKey = (id: number) => ["conversations", "detail", id] as const;
export const messagesKey = (id: number) => ["conversations", id, "messages"] as const;

function updateConversationList(
  current: unknown,
  updater: (items: Conversation[]) => Conversation[]
) {
  const typedCurrent = current as
    | { pages: Array<{ data: Conversation[]; meta: Record<string, unknown> }> }
    | undefined;
  if (!typedCurrent?.pages) return current;

  return {
    ...typedCurrent,
    pages: typedCurrent.pages.map((page, index) =>
      index === 0 ? { ...page, data: updater(page.data) } : page
    ),
  };
}

function upsertConversationToTop(current: unknown, conversation: Conversation) {
  return updateConversationList(current, (items) => {
    const without = items.filter((item) => item.id !== conversation.id);
    return [conversation, ...without].sort((a, b) => {
      const aTime = a.last_message_at ? Date.parse(a.last_message_at) : 0;
      const bTime = b.last_message_at ? Date.parse(b.last_message_at) : 0;
      return bTime - aTime;
    });
  });
}

/** Polls only while the socket isn't connected, mirroring the WhatsApp-status page's pattern. */
export function useConversationList(filters: ConversationFilters) {
  const { socket, isConnected } = useSocket();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: conversationsKey(filters),
    queryFn: ({ pageParam }) => fetchConversations({ ...filters, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const current = lastPage.meta.page ?? 1;
      const last = lastPage.meta.last_page ?? current;
      return current < last ? current + 1 : undefined;
    },
    placeholderData: keepPreviousData,
    refetchInterval: isConnected ? false : 10_000,
  });

  useEffect(() => {
    if (!socket || !user?.workspace_id) return;
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    };
    const joinRoom = () => {
      socket.emit("join", `workspace:${user.workspace_id}:inbox`);
    };

    const handleConversationPayload = (payload: { conversation?: Conversation } | Conversation) => {
      const conversation: Conversation | undefined =
        "conversation" in payload ? payload.conversation : (payload as Conversation);
      // Some events (e.g. conversation.assigned) may carry only a partial row;
      // upserting it would inject an entry with an undefined id that breaks the
      // list's React keys. Refetch the full list instead.
      if (!conversation || typeof conversation.id !== "number") {
        refresh();
        return;
      }
      queryClient.setQueriesData({ queryKey: ["conversations"] }, (current) =>
        upsertConversationToTop(current, conversation)
      );
      queryClient.setQueryData(conversationKey(conversation.id), conversation);
    };
    // The gateway's `message.created` payload only carries a minimal
    // `conversation: { id, lastMessagePreview }` summary — upserting that would
    // clobber the list with a partial row, so refetch the full list instead.
    const handleMessageCreated = () => {
      refresh();
    };

    joinRoom();
    socket.on("connect", joinRoom);
    socket.on("conversation.created", handleConversationPayload);
    socket.on("conversation.updated", handleConversationPayload);
    socket.on("conversation.assigned", handleConversationPayload);
    socket.on("conversation.closed", handleConversationPayload);
    socket.on("conversation.reopened", handleConversationPayload);
    socket.on("conversation.priority_changed", handleConversationPayload);
    socket.on("conversation.read", refresh);
    socket.on("message.created", handleMessageCreated);
    socket.on("message.updated", refresh);
    socket.on("message.failed", refresh);

    return () => {
      socket.off("connect", joinRoom);
      socket.off("conversation.created", handleConversationPayload);
      socket.off("conversation.updated", handleConversationPayload);
      socket.off("conversation.assigned", handleConversationPayload);
      socket.off("conversation.closed", handleConversationPayload);
      socket.off("conversation.reopened", handleConversationPayload);
      socket.off("conversation.priority_changed", handleConversationPayload);
      socket.off("conversation.read", refresh);
      socket.off("message.created", handleMessageCreated);
      socket.off("message.updated", refresh);
      socket.off("message.failed", refresh);
    };
  }, [socket, user?.workspace_id, queryClient]);

  return query;
}

export function useConversation(conversationId: number | null) {
  const { socket, isConnected } = useSocket();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: conversationId ? conversationKey(conversationId) : ["conversations", "detail", "none"],
    queryFn: () => fetchConversation(conversationId as number),
    enabled: !!conversationId,
    refetchInterval: isConnected ? false : 10_000,
  });

  useEffect(() => {
    if (!socket || !conversationId || !user?.workspace_id) return;
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: conversationKey(conversationId) });
    };
    const joinRoom = () => {
      socket.emit("join", `workspace:${user.workspace_id}:conversation:${conversationId}`);
    };
    joinRoom();
    socket.on("connect", joinRoom);
    socket.on("conversation.updated", invalidate);
    socket.on("conversation.assigned", invalidate);
    socket.on("conversation.closed", invalidate);
    socket.on("conversation.reopened", invalidate);
    socket.on("conversation.priority_changed", invalidate);

    return () => {
      socket.off("connect", joinRoom);
      socket.off("conversation.updated", invalidate);
      socket.off("conversation.assigned", invalidate);
      socket.off("conversation.closed", invalidate);
      socket.off("conversation.reopened", invalidate);
      socket.off("conversation.priority_changed", invalidate);
    };
  }, [socket, conversationId, user?.workspace_id, queryClient]);

  return query;
}

export function useMessages(conversationId: number | null) {
  const { socket, isConnected } = useSocket();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: conversationId ? messagesKey(conversationId) : ["conversations", "none", "messages"],
    queryFn: () => fetchMessages(conversationId as number, { per_page: 30 }),
    enabled: !!conversationId,
    // Poll only while the socket isn't connected (same pattern as the list/
    // conversation queries) so sent/received messages still surface without the
    // realtime channel.
    refetchInterval: isConnected ? false : 10_000,
  });

  useEffect(() => {
    if (!socket || !conversationId || !user?.workspace_id) return;

    // The gateway fans `message.*` events out to `workspace:{id}:conversation:{conversationId}`
    // (see whatsapp-gateway/src/lib/socket-server.ts), so join that room and re-join
    // on reconnect - without it the open chat never sees inbound/outbound updates.
    const joinRoom = () => {
      socket.emit("join", `workspace:${user.workspace_id}:conversation:${conversationId}`);
    };
    joinRoom();
    socket.on("connect", joinRoom);

    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    };

    // `message.created` carries a minimal camelCase payload ({message, conversation});
    // refetching the real rows guarantees the full Message shape (sender, media, etc.).
    const handleCreated = () => {
      refresh();
    };

    // `message.updated` is `{ messageId, changes: { status } }` from the gateway's
    // status pipeline - merge it into the cached message for live ticks.
    const handleUpdated = (payload: { messageId: number; changes?: Partial<Message> }) => {
      queryClient.setQueryData(messagesKey(conversationId), (current: unknown) => {
        const typedCurrent = current as { data: Message[]; meta: Record<string, unknown> } | undefined;
        if (!typedCurrent) return current;
        return {
          ...typedCurrent,
          data: typedCurrent.data.map((m) =>
            m.id === payload.messageId ? { ...m, ...payload.changes } : m
          ),
        };
      });
    };

    // `message.failed` has no message id (the row is never persisted), so a
    // refetch is the best we can do.
    const handleFailed = () => {
      refresh();
    };

    socket.on("message.created", handleCreated);
    socket.on("message.updated", handleUpdated);
    socket.on("message.failed", handleFailed);

    return () => {
      socket.off("connect", joinRoom);
      socket.off("message.created", handleCreated);
      socket.off("message.updated", handleUpdated);
      socket.off("message.failed", handleFailed);
    };
  }, [socket, conversationId, user?.workspace_id, queryClient]);

  return query;
}

export function useLoadOlderMessages(conversationId: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cursor: string) => {
      if (!conversationId) throw new Error("No conversation selected");
      return fetchMessages(conversationId, { per_page: 30, cursor });
    },
    onSuccess: (older) => {
      if (!conversationId) return;
      queryClient.setQueryData(messagesKey(conversationId), (current: unknown) => {
        const typedCurrent = current as { data: Message[]; meta: Record<string, unknown> } | undefined;
        if (!typedCurrent) return { data: older.data, meta: older.meta };
        return { data: [...typedCurrent.data, ...older.data], meta: older.meta };
      });
    },
  });
}

export function useSendMessage(conversationId: number | null) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (payload: {
      body?: string;
      replied_to_message_id?: number | null;
      message_type?: OutboundMessageType;
      media?: OutboundMedia;
    }) => {
      if (!conversationId) throw new Error("No conversation selected");
      return sendMessage(conversationId, payload);
    },
    onMutate: async (payload) => {
      if (!conversationId) return undefined;
      // Cancel in-flight refetches so they can't overwrite the optimistic row
      // before the server row lands.
      await queryClient.cancelQueries({ queryKey: messagesKey(conversationId) });
      const tempId = -Date.now();
      const tempMessage: Message = {
        id: tempId,
        conversation_id: conversationId,
        whatsapp_message_id: `pending:${tempId}`,
        direction: "outbound",
        sender_type: "user",
        sender: user ? { id: Number(user.id), name: user.name, email: user.email } : null,
        message_type: payload.message_type ?? "text",
        body: payload.body ?? null,
        status: "queued",
        replied_to_message_id: payload.replied_to_message_id ?? null,
        sent_at: new Date().toISOString(),
        delivered_at: null,
        read_at: null,
        created_at: new Date().toISOString(),
        media: null,
        reactions: [],
      };
      queryClient.setQueryData(messagesKey(conversationId), (current: unknown) => {
        const typedCurrent = current as { data: Message[]; meta: Record<string, unknown> } | undefined;
        if (!typedCurrent) return current;
        return { ...typedCurrent, data: [tempMessage, ...typedCurrent.data] };
      });
      return { tempId };
    },
    onSuccess: (result) => {
      if (!conversationId) return;
      const isQueuedAck = (value: Message | SendMessageQueuedAck): value is SendMessageQueuedAck =>
        typeof value === "object" && value !== null && "dispatchId" in value;

      if (isQueuedAck(result)) {
        // The gateway persists the queued row right after enqueueing and emits
        // message.created; that socket event (or the next poll) swaps the
        // optimistic bubble for the real row. Delay the invalidate slightly so
        // the first refetch is likely to find the server row rather than an
        // empty page that would make the just-sent message flicker away.
        window.setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) });
        }, 1500);
      } else {
        queryClient.setQueryData(messagesKey(conversationId), (current: unknown) => {
          const typedCurrent = current as { data: Message[]; meta: Record<string, unknown> } | undefined;
          if (!typedCurrent) return current;
          if (typedCurrent.data.some((m) => m.id === result.id)) return current;
          return { ...typedCurrent, data: [result, ...typedCurrent.data] };
        });
      }
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (_error, _payload, context) => {
      if (!conversationId || !context) return;
      const { tempId } = context;
      queryClient.setQueryData(messagesKey(conversationId), (current: unknown) => {
        const typedCurrent = current as { data: Message[]; meta: Record<string, unknown> } | undefined;
        if (!typedCurrent) return current;
        return { ...typedCurrent, data: typedCurrent.data.filter((m) => m.id !== tempId) };
      });
    },
  });
}

export function useConversationActions(conversationId: number | null) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
  };

  const assign = useMutation({
    mutationFn: (payload: { assigned_user_id?: number | null; assigned_team_id?: number | null }) => {
      if (!conversationId) throw new Error("No conversation selected");
      return assignConversation(conversationId, payload);
    },
    onSuccess: invalidate,
  });

  const close = useMutation({
    mutationFn: () => {
      if (!conversationId) throw new Error("No conversation selected");
      return closeConversation(conversationId);
    },
    onSuccess: invalidate,
  });

  const archive = useMutation({
    mutationFn: () => {
      if (!conversationId) throw new Error("No conversation selected");
      return archiveConversation(conversationId);
    },
    onSuccess: invalidate,
  });

  const unarchive = useMutation({
    mutationFn: () => {
      if (!conversationId) throw new Error("No conversation selected");
      return unarchiveConversation(conversationId);
    },
    onSuccess: invalidate,
  });

  const pin = useMutation({
    mutationFn: () => {
      if (!conversationId) throw new Error("No conversation selected");
      return pinConversation(conversationId);
    },
    onSuccess: invalidate,
  });

  const unpin = useMutation({
    mutationFn: () => {
      if (!conversationId) throw new Error("No conversation selected");
      return unpinConversation(conversationId);
    },
    onSuccess: invalidate,
  });

  const mute = useMutation({
    mutationFn: (mutedUntil?: string | null) => {
      if (!conversationId) throw new Error("No conversation selected");
      return muteConversation(conversationId, mutedUntil);
    },
    onSuccess: invalidate,
  });

  const unmute = useMutation({
    mutationFn: () => {
      if (!conversationId) throw new Error("No conversation selected");
      return unmuteConversation(conversationId);
    },
    onSuccess: invalidate,
  });

  const star = useMutation({
    mutationFn: () => {
      if (!conversationId) throw new Error("No conversation selected");
      return starConversation(conversationId);
    },
    onSuccess: invalidate,
  });

  const unstar = useMutation({
    mutationFn: () => {
      if (!conversationId) throw new Error("No conversation selected");
      return unstarConversation(conversationId);
    },
    onSuccess: invalidate,
  });

  const reopen = useMutation({
    mutationFn: () => {
      if (!conversationId) throw new Error("No conversation selected");
      return reopenConversation(conversationId);
    },
    onSuccess: invalidate,
  });

  const markRead = useMutation({
    mutationFn: () => {
      if (!conversationId) throw new Error("No conversation selected");
      return markConversationRead(conversationId);
    },
    onSuccess: invalidate,
  });

  const changePriority = useMutation({
    mutationFn: (priority: ConversationPriority) => {
      if (!conversationId) throw new Error("No conversation selected");
      return changeConversationPriority(conversationId, priority);
    },
    onSuccess: invalidate,
  });

  const clearMessages = useMutation({
    mutationFn: () => {
      if (!conversationId) throw new Error("No conversation selected");
      return clearConversationMessages(conversationId);
    },
    onSuccess: invalidate,
  });

  const deleteConv = useMutation({
    mutationFn: () => {
      if (!conversationId) throw new Error("No conversation selected");
      return deleteConversation(conversationId);
    },
    onSuccess: invalidate,
  });

  const block = useMutation({
    mutationFn: () => {
      if (!conversationId) throw new Error("No conversation selected");
      return blockConversation(conversationId);
    },
    onSuccess: invalidate,
  });

  const unblock = useMutation({
    mutationFn: () => {
      if (!conversationId) throw new Error("No conversation selected");
      return unblockConversation(conversationId);
    },
    onSuccess: invalidate,
  });

  const report = useMutation({
    mutationFn: (reason?: string) => {
      if (!conversationId) throw new Error("No conversation selected");
      return reportConversation(conversationId, reason);
    },
    onSuccess: invalidate,
  });

  return { assign, close, reopen, markRead, changePriority, archive, unarchive, pin, unpin, mute, unmute, star, unstar, clearMessages, deleteConv, block, unblock, report };
}

export type { Conversation, Message };

/**
 * Typing indicator state for a conversation.
 */
export interface TypingState {
  isTyping: boolean;
  name?: string;
  userId?: number;
  contactId?: number;
  timestamp: number;
}

/**
 * Hook to manage typing indicators for a conversation.
 * Sends typing indicators when the agent types and receives
 * typing indicators from contacts via Socket.IO.
 */
export function useTypingIndicator(conversationId: number | null) {
  const { socket } = useSocket();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [typingUsers, setTypingUsers] = useState<Map<number, TypingState>>(new Map());
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCurrentlyTypingRef = useRef(false);

  // Listen for typing events from other users/contacts
  useEffect(() => {
    if (!socket || !conversationId || !user?.workspace_id) return;

    const handleTypingUpdated = (payload: {
      conversationId: number;
      userId?: number;
      contactId?: number;
      isTyping: boolean;
      name?: string;
    }) => {
      if (payload.conversationId !== conversationId) return;
      // Don't show our own typing indicator
      if (payload.userId && user.id && String(payload.userId) === user.id) return;

      const key = payload.userId ?? payload.contactId ?? 0;
      setTypingUsers((prev) => {
        const next = new Map(prev);
        if (payload.isTyping) {
          next.set(key, {
            isTyping: true,
            name: payload.name,
            userId: payload.userId,
            contactId: payload.contactId,
            timestamp: Date.now(),
          });
        } else {
          next.delete(key);
        }
        return next;
      });
    };

    socket.on("typing.updated", handleTypingUpdated);

    return () => {
      socket.off("typing.updated", handleTypingUpdated);
    };
  }, [socket, conversationId, user?.workspace_id, user?.id]);

  // Auto-expire typing indicators after 5 seconds
  useEffect(() => {
    if (typingUsers.size === 0) return;

    const interval = setInterval(() => {
      const now = Date.now();
      setTypingUsers((prev) => {
        const next = new Map(prev);
        let changed = false;
        for (const [key, state] of next) {
          if (now - state.timestamp > 5000) {
            next.delete(key);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [typingUsers.size]);

  // Send typing indicator
  const sendTyping = useCallback(
    async (isTyping: boolean) => {
      if (!conversationId) return;

      // Avoid sending duplicate typing events
      if (isTyping && isCurrentlyTypingRef.current) return;
      if (!isTyping && !isCurrentlyTypingRef.current) return;

      isCurrentlyTypingRef.current = isTyping;

      try {
        await sendTypingIndicator(conversationId, isTyping);
      } catch {
        // Typing indicators are best-effort; ignore errors
      }
    },
    [conversationId]
  );

  // Start typing (with auto-stop after 3 seconds of inactivity)
  const startTyping = useCallback(() => {
    sendTyping(true);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      sendTyping(false);
      isCurrentlyTypingRef.current = false;
    }, 3000);
  }, [sendTyping]);

  // Stop typing
  const stopTyping = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    sendTyping(false);
    isCurrentlyTypingRef.current = false;
  }, [sendTyping]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  const isContactTyping = typingUsers.size > 0;
  const typingName = typingUsers.values().next().value?.name;

  return {
    typingUsers,
    isContactTyping,
    typingName,
    startTyping,
    stopTyping,
  };
}

export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (contactId: number) => createConversation(contactId),
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.setQueryData(conversationKey(conversation.id), conversation);
    },
  });
}
