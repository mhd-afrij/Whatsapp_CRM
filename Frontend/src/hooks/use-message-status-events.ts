import { useQuery } from "@tanstack/react-query";
import { fetchMessageStatusEvents } from "@/lib/conversations-api";

export function useMessageStatusEvents(conversationId: number, messageId: number) {
  return useQuery({
    queryKey: ["messages", "status-events", conversationId, messageId],
    queryFn: () => fetchMessageStatusEvents(conversationId, messageId),
    enabled: !!conversationId && !!messageId,
    staleTime: 1000 * 30, // 30 seconds
  });
}
