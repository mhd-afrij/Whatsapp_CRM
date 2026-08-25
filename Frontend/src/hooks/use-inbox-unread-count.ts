"use client";

import { useQuery } from "@tanstack/react-query";
import { useSocket } from "@/providers/socket-provider";
import { fetchConversations } from "@/lib/conversations-api";

/**
 * Cheap sidebar badge: reuses GET /conversations?unread=1 (already paginated,
 * already permission-scoped) and reads `meta.total` rather than adding a new
 * backend endpoint just for a count.
 */
export function useInboxUnreadCount(enabled: boolean): number {
  const { isConnected } = useSocket();

  const { data } = useQuery({
    queryKey: ["conversations", "unread-count"],
    queryFn: () => fetchConversations({ unread: true, per_page: 1 }),
    enabled,
    refetchInterval: isConnected ? 30_000 : 10_000,
  });

  return data?.meta.total ?? 0;
}
