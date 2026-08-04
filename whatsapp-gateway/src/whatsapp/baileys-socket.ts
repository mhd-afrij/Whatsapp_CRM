import makeWASocket, {
  useMultiFileAuthState,
  type AuthenticationState,
} from '@whiskeysockets/baileys';
import type { Contact } from '@whiskeysockets/baileys/lib/Types/Contact.js';
import { logger } from '../lib/logger';

/**
 * Minimal surface of a Baileys WASocket that ConnectionManager depends on.
 * Extracting this interface lets tests inject a fully mocked socket instead
 * of a real Baileys connection (which requires a live WhatsApp device).
 */
export interface IBaileysSocket {
  ev: {
    on(event: 'creds.update', listener: () => void | Promise<void>): void;
    on(event: 'connection.update', listener: (update: BaileysConnectionUpdate) => void): void;
    on(event: 'messages.upsert', listener: (payload: BaileysMessagesUpsert) => void): void;
    on(event: 'messages.update', listener: (payload: BaileysMessageUpdate[]) => void): void;
  };
  readonly user?: Contact;
  end(error: Error | undefined): void;
  logout(): Promise<void>;
  sendMessage(
    jid: string,
    content: { text: string } | Record<string, unknown>,
  ): Promise<{ key: { id?: string | null } } | undefined>;
  downloadMediaMessage?: (message: unknown) => Promise<Buffer>;
}

/** Minimal shape of Baileys' `messages.upsert` event this gateway consumes. */
export interface BaileysMessagesUpsert {
  type: 'notify' | 'append';
  messages: BaileysRawMessage[];
}

export interface BaileysRawMessage {
  key: { id?: string | null; remoteJid?: string | null; fromMe?: boolean | null };
  pushName?: string | null;
  messageTimestamp?: number | string | null;
  message?: Record<string, unknown> | null;
}

export interface BaileysMessageUpdate {
  key: { id?: string | null; remoteJid?: string | null };
  update: { status?: number; [k: string]: unknown };
}

export interface BaileysConnectionUpdate {
  connection?: 'connecting' | 'open' | 'close';
  qr?: string;
  lastDisconnect?: {
    error?: unknown;
  };
}

export interface AuthStateBundle {
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}

/**
 * Loads (or initializes) the multi-file auth state for a session directory.
 * Wrapped separately so it can be mocked in tests without touching disk.
 */
export async function loadAuthState(authDir: string): Promise<AuthStateBundle> {
  return useMultiFileAuthState(authDir);
}

/**
 * Real Baileys socket factory used in production, wired to the actual
 * @whiskeysockets/baileys makeWASocket API.
 *
 * Baileys stays silent about per-message decrypt/session failures (e.g.
 * "Invalid PreKey ID", "No session record") unless a `logger` is supplied -
 * without one, those errors never reach pino/stdout and a lost message looks
 * identical to one that was simply never sent. `baileysLogger` is scoped to
 * warn-and-above: Baileys is extremely chatty at info/debug.
 */
export function createBaileysSocket(state: AuthenticationState): IBaileysSocket {
  const baileysLogger = logger.child({ module: 'baileys' }).child({}, { level: 'warn' });
  const socket = makeWASocket({
    auth: state,
    logger: baileysLogger as unknown as Parameters<typeof makeWASocket>[0]['logger'],
    printQRInTerminal: false,
  });
  return socket as unknown as IBaileysSocket;
}

export type BaileysSocketFactory = typeof createBaileysSocket;
