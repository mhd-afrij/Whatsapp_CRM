import { createContext, useContext, useEffect, useState } from "react";
import { io } from "socket.io-client";

const SocketContext = createContext(null);

const SYNC_BASE_URL = import.meta.env.VITE_SYNC_BASE_URL ?? "http://localhost:3100";

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const s = io(SYNC_BASE_URL, {
      autoConnect: true,
      reconnection: true,
      transports: ["websocket", "polling"],
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocketContext() {
  return useContext(SocketContext);
}
