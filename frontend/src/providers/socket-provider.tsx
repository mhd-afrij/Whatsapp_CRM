"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "@/context/auth-context";
import { getToken } from "@/lib/token-store";
import { wrapSocketWithEnvelope } from "@/lib/socket-envelope";

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextValue | undefined>(undefined);

let activeSocket: Socket | null = null;

export function getSocket(): Socket | null {
  return activeSocket;
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4000";
    const token = getToken();

    const client = io(`${socketUrl}/gateway`, {
      transports: ["polling", "websocket"],
      auth: token ? { token } : undefined,
    });

    // Every gateway event is delivered inside an `{event_id, event_type,
    // workspace_id, occurred_at, data}` envelope (docs/EVENT_CATALOG.md). Wrap
    // the client once here so all `socket.on(...)` call sites below receive the
    // unwrapped `data` and get envelope dedup/workspace filtering for free.
    // NOTE: the auth context stores workspace_id as a string, but the envelope
    // carries a number - coerce before the strict comparison in the wrapper.
    const workspaceId =
      user?.workspace_id != null ? Number(user.workspace_id) : undefined;
    const wrapped = wrapSocketWithEnvelope(client, workspaceId);

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    wrapped.on("connect", handleConnect);
    wrapped.on("disconnect", handleDisconnect);
    wrapped.on("connect_error", handleDisconnect);

    socketRef.current = wrapped;
    activeSocket = wrapped;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- publishing the just-created socket instance is part of establishing the external connection, same pattern as auth-context.tsx
    setSocket(wrapped);

    return () => {
      wrapped.off("connect", handleConnect);
      wrapped.off("disconnect", handleDisconnect);
      wrapped.off("connect_error", handleDisconnect);
      client.disconnect();
      if (activeSocket === wrapped) {
        activeSocket = null;
      }
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
    };
  }, [isAuthenticated, user?.workspace_id]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>{children}</SocketContext.Provider>
  );
}

export function useSocket(): SocketContextValue {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return ctx;
}

