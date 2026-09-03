import { useQuery } from "@tanstack/react-query";
import { searchMessages } from "@/lib/conversations-api";

export function useMessageSearch(conversationId: number, query: string, page: number = 1) {
  return useQuery({
    queryKey: ["messages", "search", conversationId, query, page],
    queryFn: async () => {
      if (!query.trim()) {
        return null;
      }
      return searchMessages(conversationId, query, page);
    },
    enabled: !!query.trim() && !!conversationId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
