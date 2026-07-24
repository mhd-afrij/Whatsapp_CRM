import { io, type Socket } from "socket.io-client";

const SYNC_BASE_URL = import.meta.env.VITE_SYNC_BASE_URL ?? "http://localhost:3100";

let socket: Socket | null = null;

export function getSyncSocket(): Socket {
  if (!socket) {
    socket = io(SYNC_BASE_URL, {
      autoConnect: true,
      reconnection: true,
      transports: ["websocket", "polling"],
    });
  }
  return socket;
}
