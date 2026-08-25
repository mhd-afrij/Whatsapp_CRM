import { describe, it, expect, vi } from "vitest";
import type { Socket } from "socket.io-client";
import { wrapSocketWithEnvelope } from "./socket-envelope";

/** Minimal fake matching the on/off surface wrapSocketWithEnvelope actually touches. */
function makeFakeSocket() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const socket = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)?.add(handler);
      return socket;
    }),
    off: vi.fn((event?: string, handler?: (...args: unknown[]) => void) => {
      if (event && handler) listeners.get(event)?.delete(handler);
      return socket;
    }),
    trigger(event: string, payload: unknown) {
      listeners.get(event)?.forEach((h) => h(payload));
    },
  };
  return socket;
}

function makeEnvelope(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    event_id: "evt-1",
    event_type: "message.created",
    workspace_id: 1,
    occurred_at: new Date().toISOString(),
    data: { body: "hi" },
    ...overrides,
  };
}

describe("wrapSocketWithEnvelope", () => {
  it("unwraps the envelope so the handler receives just data", () => {
    const fake = makeFakeSocket();
    const wrapped = wrapSocketWithEnvelope(fake as unknown as Socket, 1);
    const handler = vi.fn();

    wrapped.on("message.created", handler);
    fake.trigger("message.created", makeEnvelope());

    expect(handler).toHaveBeenCalledWith({ body: "hi" });
  });

  it("drops a duplicate delivery of the same event_id", () => {
    const fake = makeFakeSocket();
    const wrapped = wrapSocketWithEnvelope(fake as unknown as Socket, 1);
    const handler = vi.fn();

    wrapped.on("message.created", handler);
    fake.trigger("message.created", makeEnvelope({ event_id: "dup" }));
    fake.trigger("message.created", makeEnvelope({ event_id: "dup" }));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("ignores events for a different workspace", () => {
    const fake = makeFakeSocket();
    const wrapped = wrapSocketWithEnvelope(fake as unknown as Socket, 1);
    const handler = vi.fn();

    wrapped.on("message.created", handler);
    fake.trigger("message.created", makeEnvelope({ workspace_id: 999 }));

    expect(handler).not.toHaveBeenCalled();
  });

  it("passes through non-enveloped payloads unchanged (backward compatibility)", () => {
    const fake = makeFakeSocket();
    const wrapped = wrapSocketWithEnvelope(fake as unknown as Socket, 1);
    const handler = vi.fn();

    wrapped.on("connect", handler);
    fake.trigger("connect", undefined);

    expect(handler).toHaveBeenCalledWith(undefined);
  });

  it("off() removes the correct wrapped listener so it stops firing", () => {
    const fake = makeFakeSocket();
    const wrapped = wrapSocketWithEnvelope(fake as unknown as Socket, 1);
    const handler = vi.fn();

    wrapped.on("message.created", handler);
    wrapped.off("message.created", handler);
    fake.trigger("message.created", makeEnvelope());

    expect(handler).not.toHaveBeenCalled();
  });
});
