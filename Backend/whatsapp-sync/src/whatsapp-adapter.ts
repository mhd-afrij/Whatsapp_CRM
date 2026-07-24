import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type AuthenticationState,
  type BaileysEventMap,
  type WASocket,
} from "@whiskeysockets/baileys";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import type { Logger } from "pino";

export interface WhatsAppConnectionSnapshot {
  state: "unlinked" | "connecting" | "linked";
  deviceName: string | null;
  qrCode: string | null;
  lastSeenAt: string | null;
  linkedAt: string | null;
}

export interface IncomingMessage {
  from: string;
  body: string;
  waMessageId: string | null;
  timestamp: string;
}

export interface SentMessage {
  id: string | null;
}

type ConnectionUpdate = BaileysEventMap["connection.update"];
type MessagesUpsertPayload = BaileysEventMap["messages.upsert"];

export type SocketFactory = (authState: AuthenticationState, version: [number, number, number]) => WASocket;

export interface WhatsAppAdapter {
  snapshot(): WhatsAppConnectionSnapshot;
  /** Ensures a socket exists and a pairing attempt is in progress. The real QR arrives
   * asynchronously via onStateChange once Baileys emits it — this does not return the QR directly. */
  connect(): Promise<WhatsAppConnectionSnapshot>;
  /** Logs out of the real WhatsApp session, clears local credentials, and re-arms for a fresh pairing. */
  logout(): Promise<void>;
  heartbeat(): void;
  sendMessage(jid: string, text: string): Promise<SentMessage>;
  onStateChange(handler: (snapshot: WhatsAppConnectionSnapshot) => void): void;
  onMessage(handler: (message: IncomingMessage) => void): void;
}

export async function createWhatsAppAdapter(options: {
  authDir: string;
  logger: Logger;
  socketFactory?: SocketFactory;
}): Promise<WhatsAppAdapter> {
  const authDir = resolve(options.authDir);
  if (!existsSync(authDir)) {
    mkdirSync(authDir, { recursive: true });
  }

  const makeSocket: SocketFactory =
    options.socketFactory ??
    ((auth, version) =>
      makeWASocket({
        auth,
        version,
        printQRInTerminal: false,
        browser: ["Whatsapp CRM", "Chrome", "1.0.0"],
      }));

  const state: WhatsAppConnectionSnapshot = {
    state: "unlinked",
    deviceName: null,
    qrCode: null,
    linkedAt: null,
    lastSeenAt: null,
  };

  const stateChangeHandlers = new Set<(snapshot: WhatsAppConnectionSnapshot) => void>();
  const messageHandlers = new Set<(message: IncomingMessage) => void>();

  let socket: WASocket | null = null;

  function emitStateChange() {
    const snapshot = { ...state };
    for (const handler of stateChangeHandlers) handler(snapshot);
  }

  async function attachSocket() {
    const { state: authState, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({
      version: [2, 3000, 0] as [number, number, number],
    }));
    socket = makeSocket(authState, version);

    socket.ev.on("creds.update", saveCreds);

    socket.ev.on("connection.update", (update: ConnectionUpdate) => {
      if (update.qr) {
        state.state = "connecting";
        state.qrCode = update.qr;
        emitStateChange();
      }

      if (update.connection === "open") {
        state.state = "linked";
        state.deviceName = socket?.authState?.creds?.me?.name || state.deviceName || "WhatsApp Web";
        state.linkedAt ??= new Date().toISOString();
        state.lastSeenAt = new Date().toISOString();
        state.qrCode = null;
        emitStateChange();
      }

      if (update.connection === "close") {
        const error = update.lastDisconnect?.error;
        const code =
          error && typeof error === "object" && "output" in error
            ? (error as { output?: { statusCode?: number } }).output?.statusCode
            : undefined;
        if (code === DisconnectReason.loggedOut) {
          state.state = "unlinked";
          state.deviceName = null;
          state.qrCode = null;
          state.linkedAt = null;
          state.lastSeenAt = null;
          emitStateChange();
        } else {
          state.state = "connecting";
          emitStateChange();
          options.logger.warn({ code }, "whatsapp socket disconnected, reconnecting");
          void attachSocket().catch((error) => options.logger.error({ err: error }, "reconnect failed"));
        }
      }
    });

    socket.ev.on("messages.upsert", (payload: MessagesUpsertPayload) => {
      if (payload?.type !== "notify") return;
      for (const msg of payload.messages ?? []) {
        if (msg.key?.fromMe) continue;
        const body: string | null =
          msg.message?.conversation ?? msg.message?.extendedTextMessage?.text ?? null;
        if (!body) continue;

        state.lastSeenAt = new Date().toISOString();
        const incoming: IncomingMessage = {
          from: msg.key?.remoteJid ?? "unknown",
          body,
          waMessageId: msg.key?.id ?? null,
          timestamp: new Date((Number(msg.messageTimestamp) || Date.now() / 1000) * 1000).toISOString(),
        };
        for (const handler of messageHandlers) handler(incoming);
      }
      emitStateChange();
    });

    options.logger.info({ authDir, version }, "whatsapp adapter initialized");
  }

  await attachSocket();

  return {
    snapshot() {
      return { ...state };
    },
    async connect() {
      if (!socket) {
        await attachSocket();
      }
      if (state.state === "unlinked") {
        state.state = "connecting";
        emitStateChange();
      }
      return { ...state };
    },
    async logout() {
      if (socket) {
        try {
          await socket.logout();
        } catch (error) {
          options.logger.warn({ err: error }, "error logging out of whatsapp socket");
        }
      }
      socket = null;

      if (existsSync(authDir)) {
        rmSync(authDir, { recursive: true, force: true });
        mkdirSync(authDir, { recursive: true });
      }

      state.state = "unlinked";
      state.deviceName = null;
      state.qrCode = null;
      state.linkedAt = null;
      state.lastSeenAt = null;
      emitStateChange();

      await attachSocket();
    },
    heartbeat() {
      state.lastSeenAt = new Date().toISOString();
    },
    async sendMessage(jid, text) {
      if (!socket || state.state !== "linked") {
        throw new Error("WhatsApp session is not linked");
      }
      const result = await socket.sendMessage(jid, { text });
      state.lastSeenAt = new Date().toISOString();
      emitStateChange();
      return { id: result?.key?.id ?? null };
    },
    onStateChange(handler) {
      stateChangeHandlers.add(handler);
    },
    onMessage(handler) {
      messageHandlers.add(handler);
    },
  };
}
