"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "@/context/auth-context";
import { getToken } from "@/lib/token-store";
import { wrapSocketWithEnvelope } from "@/lib/socket-envelope";

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
});

const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4000";

export function SocketProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- tearing down the socket connection when auth is lost is a direct synchronization of external state, not derived render state
      setSocket((current) => {
        current?.disconnect();
        return null;
      });
      setIsConnected(false);
      return;
    }

    const token = getToken();
    const workspaceId = user?.workspace_id !== undefined ? Number(user.workspace_id) : undefined;
    const instance = wrapSocketWithEnvelope(
      io(`${socketUrl}/gateway`, {
        autoConnect: true,
        transports: ["websocket"],
        auth: token ? { token } : undefined,
      }),
      Number.isFinite(workspaceId) ? workspaceId : undefined
    );

    instance.on("connect", () => setIsConnected(true));
    instance.on("disconnect", () => setIsConnected(false));

    setSocket(instance);

    return () => {
      instance.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reconnecting on every user object identity change (e.g. a background /auth/me refetch) would tear down and rejoin all inbox rooms unnecessarily; only workspace_id actually matters and that doesn't change without a full re-auth (isAuthenticated flip).
  }, [isAuthenticated]);

  const value = useMemo(() => ({ socket, isConnected }), [socket, isConnected]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextValue {
  return useContext(SocketContext);
}
