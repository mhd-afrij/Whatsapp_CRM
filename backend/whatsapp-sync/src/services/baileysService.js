import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

/**
 * @typedef {{
 *   state: "unlinked" | "connecting" | "linked",
 *   deviceName: string | null,
 *   qrCode: string | null,
 *   lastSeenAt: string | null,
 *   linkedAt: string | null
 * }} WhatsAppConnectionSnapshot
 *
 * @typedef {{
 *   from: string,
 *   body: string,
 *   waMessageId: string | null,
 *   timestamp: string
 * }} IncomingMessage
 *
 * @typedef {{
 *   id: string | null
 * }} SentMessage
 */

/**
 * @param {{ authDir: string, logger: object, socketFactory?: Function }} options
 * @returns {Promise<{
 *   snapshot: () => WhatsAppConnectionSnapshot,
 *   connect: () => Promise<WhatsAppConnectionSnapshot>,
 *   logout: () => Promise<void>,
 *   heartbeat: () => void,
 *   sendMessage: (jid: string, text: string) => Promise<SentMessage>,
 *   onStateChange: (handler: (snapshot: WhatsAppConnectionSnapshot) => void) => void,
 *   onMessage: (handler: (message: IncomingMessage) => void) => void
 * }>}
 */
export async function createWhatsAppAdapter(options) {
  const authDir = resolve(options.authDir);
  if (!existsSync(authDir)) {
    mkdirSync(authDir, { recursive: true });
  }

  const makeSocket =
    options.socketFactory ??
    ((auth, version) =>
      makeWASocket({
        auth,
        version,
        printQRInTerminal: false,
        browser: ["Whatsapp CRM", "Chrome", "1.0.0"],
      }));

  const state = {
    state: "unlinked",
    deviceName: null,
    qrCode: null,
    linkedAt: null,
    lastSeenAt: null,
  };

  const stateChangeHandlers = new Set();
  const messageHandlers = new Set();

  let socket = null;

  function emitStateChange() {
    const snapshot = { ...state };
    for (const handler of stateChangeHandlers) handler(snapshot);
  }

  async function attachSocket() {
    const { state: authState, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({
      version: [2, 3000, 0],
    }));
    socket = makeSocket(authState, version);

    socket.ev.on("creds.update", saveCreds);

    socket.ev.on("connection.update", (update) => {
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
            ? error.output?.statusCode
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

    socket.ev.on("messages.upsert", (payload) => {
      if (payload?.type !== "notify") return;
      for (const msg of payload.messages ?? []) {
        if (msg.key?.fromMe) continue;
        const body =
          msg.message?.conversation ?? msg.message?.extendedTextMessage?.text ?? null;
        if (!body) continue;

        state.lastSeenAt = new Date().toISOString();
        const incoming = {
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
