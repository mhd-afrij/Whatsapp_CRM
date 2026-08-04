"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useSocket } from "@/providers/socket-provider";
import { useAuth } from "@/context/auth-context";
import {
  assignConversation,
  changeConversationPriority,
  closeConversation,
  fetchConversation,
  fetchConversations,
  fetchMessages,
  markConversationRead,
  reopenConversation,
  sendMessage,
  type Conversation,
  type ConversationFilters,
  type ConversationPriority,
  type Message,
  type SendMessageQueuedAck,
} from "@/lib/conversations-api";

export const conversationsKey = (filters: ConversationFilters) => ["conversations", filters] as const;
export const conversationKey = (id: number) => ["conversations", "detail", id] as const;
export const messagesKey = (id: number) => ["conversations", id, "messages"] as const;

/** Polls only while the socket isn't connected, mirroring the WhatsApp-status page's pattern. */
export function useConversationList(filters: ConversationFilters) {
  const { socket, isConnected } = useSocket();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: conversationsKey(filters),
    queryFn: () => fetchConversations(filters),
    placeholderData: keepPreviousData,
    refetchInterval: isConnected ? false : 10_000,
  });

  useEffect(() => {
    if (!socket || !user?.workspace_id) return;
    socket.emit("join", `workspace:${user.workspace_id}:inbox`);

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    };

    socket.on("conversation.created", invalidate);
    socket.on("conversation.updated", invalidate);
    socket.on("conversation.assigned", invalidate);
    socket.on("conversation.closed", invalidate);
    socket.on("conversation.reopened", invalidate);
    socket.on("conversation.priority_changed", invalidate);
    socket.on("conversation.read", invalidate);
    socket.on("message.created", invalidate);

    return () => {
      socket.off("conversation.created", invalidate);
      socket.off("conversation.updated", invalidate);
      socket.off("conversation.assigned", invalidate);
      socket.off("conversation.closed", invalidate);
      socket.off("conversation.reopened", invalidate);
      socket.off("conversation.priority_changed", invalidate);
      socket.off("conversation.read", invalidate);
      socket.off("message.created", invalidate);
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
    socket.emit("join", `workspace:${user.workspace_id}:conversation:${conversationId}`);

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: conversationKey(conversationId) });
    };
    socket.on("conversation.updated", invalidate);
    socket.on("conversation.assigned", invalidate);
    socket.on("conversation.closed", invalidate);
    socket.on("conversation.reopened", invalidate);
    socket.on("conversation.priority_changed", invalidate);

    return () => {
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
  const { socket } = useSocket();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: conversationId ? messagesKey(conversationId) : ["conversations", "none", "messages"],
    queryFn: () => fetchMessages(conversationId as number, { per_page: 30 }),
    enabled: !!conversationId,
  });

  useEffect(() => {
    if (!socket || !conversationId) return;

    const handleCreated = (payload: Message) => {
      queryClient.setQueryData(messagesKey(conversationId), (current: unknown) => {
        const typedCurrent = current as { data: Message[]; meta: Record<string, unknown> } | undefined;
        if (!typedCurrent) return current;
        if (typedCurrent.data.some((m) => m.id === payload.id)) return current;
        return { ...typedCurrent, data: [payload, ...typedCurrent.data] };
      });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    };

    const handleUpdated = (payload: Partial<Message> & { id: number }) => {
      queryClient.setQueryData(messagesKey(conversationId), (current: unknown) => {
        const typedCurrent = current as { data: Message[]; meta: Record<string, unknown> } | undefined;
        if (!typedCurrent) return current;
        return {
          ...typedCurrent,
          data: typedCurrent.data.map((m) => (m.id === payload.id ? { ...m, ...payload } : m)),
        };
      });
    };

    socket.on("message.created", handleCreated);
    socket.on("message.updated", handleUpdated);
    socket.on("message.failed", handleUpdated);

    return () => {
      socket.off("message.created", handleCreated);
      socket.off("message.updated", handleUpdated);
      socket.off("message.failed", handleUpdated);
    };
  }, [socket, conversationId, queryClient]);

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
  return useMutation({
    mutationFn: (payload: { body: string; replied_to_message_id?: number | null }) => {
      if (!conversationId) throw new Error("No conversation selected");
      return sendMessage(conversationId, payload);
    },
    onSuccess: (result) => {
      if (!conversationId) return;
      const isQueuedAck = (value: Message | SendMessageQueuedAck): value is SendMessageQueuedAck =>
        typeof value === "object" && value !== null && "dispatchId" in value;

      if (isQueuedAck(result)) {
        queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) });
        window.setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) });
        }, 2000);
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

  return { assign, close, reopen, markRead, changePriority };
}

export type { Conversation, Message };
