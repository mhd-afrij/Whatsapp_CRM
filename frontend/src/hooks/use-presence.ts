"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSocket } from "@/providers/socket-provider";
import { useAuth } from "@/context/auth-context";
import {
  fetchPresence,
  updatePresence,
  type PresenceStatus,
  type UserPresence,
} from "@/lib/presence-api";

export const presenceKey = ["presence"] as const;

/**
 * Hook to manage user presence status.
 * Sends heartbeat updates and listens for presence changes from other users.
 */
export function usePresence() {
  const { socket, isConnected } = useSocket();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [userPresence, setUserPresence] = useState<Map<number, UserPresence>>(new Map());
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch initial presence data
  const { data: presenceData } = useQuery({
    queryKey: presenceKey,
    queryFn: fetchPresence,
    refetchInterval: isConnected ? 30_000 : false,
  });

  // Update local state when presence data is fetched
  useEffect(() => {
    if (!presenceData) return;
    const map = new Map<number, UserPresence>();
    for (const p of presenceData) {
      map.set(p.user_id, p);
    }
    setUserPresence(map);
  }, [presenceData]);

  // Listen for presence updates via Socket.IO
  useEffect(() => {
    if (!socket || !user?.workspace_id) return;

    const handlePresenceUpdated = (payload: {
      userId: number;
      status: PresenceStatus;
      lastSeen?: string;
      name?: string;
    }) => {
      setUserPresence((prev) => {
        const next = new Map(prev);
        const existing = next.get(payload.userId);
        next.set(payload.userId, {
          user_id: payload.userId,
          name: payload.name ?? existing?.name ?? "Unknown",
          status: payload.status,
          last_active_at: payload.lastSeen ?? new Date().toISOString(),
        });
        return next;
      });
    };

    socket.on("presence.updated", handlePresenceUpdated);

    return () => {
      socket.off("presence.updated", handlePresenceUpdated);
    };
  }, [socket, user?.workspace_id]);

  // Send heartbeat to maintain presence
  useEffect(() => {
    if (!isConnected || !user) return;

    // Set initial presence to online
    updatePresence("online").catch(() => {});

    // Send heartbeat every 30 seconds
    heartbeatRef.current = setInterval(() => {
      updatePresence("online").catch(() => {});
    }, 30_000);

    // Set to offline on page unload
    const handleBeforeUnload = () => {
      updatePresence("offline").catch(() => {});
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
      window.removeEventListener("beforeunload", handleBeforeUnload);
      updatePresence("offline").catch(() => {});
    };
  }, [isConnected, user]);

  // Update presence status
  const setPresence = useCallback(async (status: PresenceStatus) => {
    try {
      await updatePresence(status);
    } catch {
      // Presence updates are best-effort
    }
  }, []);

  const getPresenceForUser = useCallback(
    (userId: number): UserPresence | undefined => {
      return userPresence.get(userId);
    },
    [userPresence]
  );

  return {
    userPresence,
    setPresence,
    getPresenceForUser,
  };
}

/**
 * Hook to display presence for a list of users (e.g., team sidebar).
 */
export function usePresenceList(userIds: number[]) {
  const { getPresenceForUser } = usePresence();

  const presenceMap = new Map<number, UserPresence | undefined>();
  for (const id of userIds) {
    presenceMap.set(id, getPresenceForUser(id));
  }

  return presenceMap;
}
