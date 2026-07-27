import { createContext, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const SocketContext = createContext(null);

const SOCKET_URL = import.meta.env.VITE_SYNC_BASE_URL ?? "http://localhost:3100";

export function SocketProvider({ children }) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    });

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, []);

  function on(event, handler) {
    if (!socketRef.current) return () => {};
    socketRef.current.on(event, handler);
    return () => socketRef.current?.off(event, handler);
  }

  function off(event, handler) {
    socketRef.current?.off(event, handler);
  }

  function emit(event, data) {
    socketRef.current?.emit(event, data);
  }

  return (
    <SocketContext.Provider value={{ connected, on, off, emit }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) throw new Error("useSocket must be used within SocketProvider");
  return context;
}
