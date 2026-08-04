"use client";

import type { Socket } from "socket.io-client";

/** Matches docs/EVENT_CATALOG.md's realtime event envelope. */
export interface EventEnvelope<T = unknown> {
  event_id: string;
  event_type: string;
  workspace_id: number;
  occurred_at: string;
  data: T;
}

function isEnvelope(payload: unknown): payload is EventEnvelope {
  return (
    !!payload &&
    typeof payload === "object" &&
    typeof (payload as Record<string, unknown>).event_id === "string" &&
    "data" in (payload as Record<string, unknown>)
  );
}

// Socket.IO's own lifecycle events are never enveloped - only app-level events are.
const PASSTHROUGH_EVENTS = new Set([
  "connect",
  "disconnect",
  "connect_error",
  "reconnect",
  "reconnect_attempt",
  "reconnect_error",
  "reconnect_failed",
]);

type Handler = (...args: unknown[]) => void;

/**
 * Wraps a socket.io-client Socket so every `on`/`off` call transparently
 * unwraps the `{event_id, event_type, workspace_id, occurred_at, data}`
 * envelope before invoking the caller's handler with just `data` - existing
 * `socket.on("message.created", handler)` call sites don't need to change.
 *
 * Also deduplicates by `event_id` (a redundant delivery - e.g. a reconnect
 * replay - is dropped rather than double-applied) and drops events for
 * another workspace as defense-in-depth; server-side room scoping is the
 * primary guarantee, this is a second check per the "ignore events for
 * another workspace" rule.
 */
export function wrapSocketWithEnvelope(socket: Socket, workspaceId: number | undefined): Socket {
  const seen = new Set<string>();
  const MAX_SEEN = 1000;

  function remember(eventId: string): boolean {
    if (seen.has(eventId)) return false;
    seen.add(eventId);
    if (seen.size > MAX_SEEN) {
      const iterator = seen.values();
      for (let i = 0; i < MAX_SEEN / 2; i++) {
        const next = iterator.next();
        if (next.done) break;
        seen.delete(next.value);
      }
    }
    return true;
  }

  // Maps each caller-supplied handler to the wrapped function actually registered with
  // Socket.IO, so `socket.off(event, handler)` can find and remove the right listener.
  const wrappedHandlers = new Map<string, Map<Handler, Handler>>();

  const originalOn = socket.on.bind(socket);
  const originalOff = socket.off.bind(socket);

  socket.on = ((event: string, handler: Handler) => {
    if (PASSTHROUGH_EVENTS.has(event)) {
      return originalOn(event, handler);
    }

    const wrapped: Handler = (payload) => {
      if (!isEnvelope(payload)) {
        handler(payload);
        return;
      }
      if (workspaceId !== undefined && payload.workspace_id !== workspaceId) {
        return;
      }
      if (!remember(payload.event_id)) {
        return;
      }
      handler(payload.data);
    };

    let byHandler = wrappedHandlers.get(event);
    if (!byHandler) {
      byHandler = new Map();
      wrappedHandlers.set(event, byHandler);
    }
    byHandler.set(handler, wrapped);

    return originalOn(event, wrapped);
  }) as typeof socket.on;

  socket.off = ((event?: string, handler?: Handler) => {
    if (!event || PASSTHROUGH_EVENTS.has(event) || !handler) {
      return originalOff(event, handler);
    }
    const byHandler = wrappedHandlers.get(event);
    const wrapped = byHandler?.get(handler);
    if (wrapped) {
      byHandler?.delete(handler);
      return originalOff(event, wrapped);
    }
    return originalOff(event, handler);
  }) as typeof socket.off;

  return socket;
}
