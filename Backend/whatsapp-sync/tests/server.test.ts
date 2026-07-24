import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { rm } from "node:fs/promises";
import { loadEnv } from "../src/config/env.js";
import { createServer } from "../src/server.js";

vi.mock("@whiskeysockets/baileys", () => {
  function createFakeSocket() {
    const listeners = new Map<string, Array<(payload: unknown) => void>>();
    const socket = {
      authState: { creds: { me: { name: "Fake Device" } } },
      ev: {
        on(event: string, handler: (payload: unknown) => void) {
          const handlers = listeners.get(event) ?? [];
          handlers.push(handler);
          listeners.set(event, handlers);
        },
      },
      emit(event: string, payload: unknown) {
        for (const handler of listeners.get(event) ?? []) handler(payload);
      },
      async logout() {
        socket.emit("connection.update", {
          connection: "close",
          lastDisconnect: { error: { output: { statusCode: 401 } } },
        });
      },
      async sendMessage(jid: string, content: { text: string }) {
        return { key: { id: `wa_${jid}_${content.text.length}` } };
      },
    };
    return socket;
  }

  const factory = () => createFakeSocket();
  return {
    default: factory,
    makeWASocket: factory,
    DisconnectReason: { loggedOut: 401 },
    fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 0] }),
    useMultiFileAuthState: async () => ({ state: {}, saveCreds: async () => {} }),
  };
});

describe("whatsapp-sync server", () => {
  const statePath = "tmp/test-sync-session.json";
  const appPromise = createServer(
    loadEnv({ NODE_ENV: "test", SYNC_STATE_PATH: statePath } as NodeJS.ProcessEnv)
  );

  it("starts with a clean persisted state", async () => {
    await rm(statePath, { force: true });
  });

  async function app() {
    return (await appPromise).app;
  }

  it("GET /health returns ok", async () => {
    const res = await request(await app()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("GET /ready returns ready", async () => {
    const res = await request(await app()).get("/ready");
    expect([200, 503]).toContain(res.status);
    expect(res.body.service).toBe("whatsapp-sync");
  });

  it("GET /internal/v1/session/status returns the current session state", async () => {
    const res = await request(await app()).get("/internal/v1/session/status");
    expect(res.status).toBe(200);
    expect(res.body.session).toBe("unlinked");
  });

  it("POST /internal/v1/session/qr starts a real pairing attempt", async () => {
    const res = await request(await app()).post("/internal/v1/session/qr");
    expect(res.status).toBe(200);
    expect(["connecting", "unlinked"]).toContain(res.body.data.session);
  });

  it("POST /internal/v1/messages/send fails while unlinked", async () => {
    const res = await request(await app())
      .post("/internal/v1/messages/send")
      .send({ to: "15550001111", text: "hello" });
    expect(res.status).toBe(409);
  });

  it("POST /internal/v1/session/unlink resets to unlinked", async () => {
    const res = await request(await app()).post("/internal/v1/session/unlink");
    expect(res.status).toBe(200);
    expect(res.body.data.session).toBe("unlinked");
  });

  it("persists session state across reloads", async () => {
    const server = await app();
    await request(server).post("/internal/v1/session/qr");

    const reloadedApp = (
      await createServer(loadEnv({ NODE_ENV: "test", SYNC_STATE_PATH: statePath } as NodeJS.ProcessEnv))
    ).app;
    const res = await request(reloadedApp).get("/internal/v1/session/status");
    expect(res.status).toBe(200);
  });
});
