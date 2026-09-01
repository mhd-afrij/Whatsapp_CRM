import { Server as SocketIOServer } from "socket.io";
import { logger } from "../config/logger.js";

/**
 * Create and configure Socket.io server.
 * @param {import("node:http").HttpServer} httpServer
 * @param {string} corsOrigin
 * @returns {SocketIOServer}
 */
export function createSocketServer(httpServer, corsOrigin) {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: corsOrigin === "*" ? true : corsOrigin.split(",") },
  });

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "client connected via socket.io");

    socket.on("disconnect", (reason) => {
      logger.debug({ socketId: socket.id, reason }, "client disconnected");
    });
  });

  return io;
}

/**
 * Emit session update to all connected clients.
 * @param {SocketIOServer} io
 * @param {object} payload
 */
export function emitSessionUpdate(io, payload) {
  io.emit("session:update", payload);
}

/**
 * Emit incoming message to all connected clients.
 * @param {SocketIOServer} io
 * @param {object} message
 */
export function emitIncomingMessage(io, message) {
  io.emit("message:incoming", message);
}
