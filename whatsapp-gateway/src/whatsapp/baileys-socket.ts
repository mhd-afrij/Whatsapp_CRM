import makeWASocket, {
  useMultiFileAuthState,
  type AuthenticationState,
} from '@whiskeysockets/baileys';
import type { Contact } from '@whiskeysockets/baileys/lib/Types/Contact.js';
import { createBaileysLogger } from '../lib/baileys-logger';

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
    on(event: 'contacts.upsert', listener: (payload: BaileysContactsUpsert) => void): void;
    on(
      event: 'chats.phoneNumberShare',
      listener: (payload: BaileysPhoneNumberShare) => void,
    ): void;
  };
  readonly user?: Contact;
  end(error: Error | undefined): void;
  logout(): Promise<void>;
  sendMessage(
    jid: string,
    content: { text: string } | Record<string, unknown>,
  ): Promise<{ key: { id?: string | null } } | undefined>;
  sendPresenceUpdate(presence: string, to: string): Promise<void>;
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

/** Baileys' `contacts.upsert` event - the user's address book, including the
 *  saved (display) name for each contact. `name` is the name the user saved
 *  for this number; `notify` is the contact's self-set profile (push) name. */
export type BaileysContactsUpsert = Contact[];

/** Baileys' `chats.phoneNumberShare` event - WhatsApp shares the real phone
 *  number (jid) behind a contact's LID (Linked ID) alias. `lid` is the opaque
 *  @lid jid used in inbound remoteJids; `jid` is the canonical phone jid. */
export interface BaileysPhoneNumberShare {
  lid: string;
  jid: string;
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
export interface BaileysSocketOptions {
  /** See BaileysLoggerOptions.onUnexpectedError - surfaced so ConnectionManager can react. */
  onUnexpectedError?: (context: string, err: unknown) => void;
  /**
   * Baileys closes the WebSocket if a keep-alive pong isn't received within
   * this window (default 30s). The observed production symptom was a ~30s
   * disconnect/reconnect loop with empty disconnect metadata - exposing the
   * knob lets an operator tune it once the real cause (network throttling vs
   * server drop) is identified from the enriched disconnect events.
   */
  keepAliveIntervalMs?: number;
  /**
   * Baileys fires `init queries` (fetchProps, fetchBlocklist, fetchPrivacySettings)
   * immediately after every connect. On flaky networks any one of these can time
   * out, and Baileys surfaces the failure through onUnexpectedError, which our
   * ConnectionManager previously treated as a dead query channel and closed the
   * socket - producing an endless connect -> init-timeout -> reconnect loop even
   * though the underlying socket was healthy. None of the synced data is needed
   * for sending/receiving messages, so we skip them by default.
   */
  fireInitQueries?: boolean;
}

export function createBaileysSocket(
  state: AuthenticationState,
  options: BaileysSocketOptions = {},
): IBaileysSocket {
  const baileysLogger = createBaileysLogger({ onUnexpectedError: options.onUnexpectedError });
  const socket = makeWASocket({
    auth: state,
    logger: baileysLogger as unknown as Parameters<typeof makeWASocket>[0]['logger'],
    printQRInTerminal: false,
    fireInitQueries: options.fireInitQueries ?? false,
    ...(options.keepAliveIntervalMs !== undefined
      ? { keepAliveIntervalMs: options.keepAliveIntervalMs }
      : {}),
  });
  return socket as unknown as IBaileysSocket;
}

export type BaileysSocketFactory = (
  state: AuthenticationState,
  options?: BaileysSocketOptions,
) => IBaileysSocket;
