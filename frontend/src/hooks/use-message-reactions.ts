import { useQuery } from "@tanstack/react-query";
import { fetchMessageReactions } from "@/lib/conversations-api";

export function useMessageReactions(conversationId: number, messageId: number) {
  return useQuery({
    queryKey: ["messages", "reactions", conversationId, messageId],
    queryFn: () => fetchMessageReactions(conversationId, messageId),
    enabled: !!conversationId && !!messageId,
    staleTime: 1000 * 10, // 10 seconds
  });
}
