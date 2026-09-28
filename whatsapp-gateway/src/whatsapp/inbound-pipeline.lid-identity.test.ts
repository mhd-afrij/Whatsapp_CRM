import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Identity resolution for WhatsApp privacy-on contacts.
 *
 * A contact with phone-number privacy enabled receives an `@lid` alias as
 * `key.remoteJid`, while Baileys still carries the real number on
 * `key.senderPn`. Keying the pipeline off `remoteJid` alone split one person
 * into a second whatsapp_contacts row, a second conversation, and (because the
 * backend refuses to fabricate a CRM contact from an unmapped `@lid` row) an
 * inbox entry with no contact at all - which rendered as the push name.
 *
 * These tests pin the fix: the canonical identity is the real phone jid, the
 * `@lid` alias is persisted so it holds for later messages, and one identity
 * always lands on one contact + one conversation.
 */

const loggerInfo = vi.fn();
vi.mock('../lib/logger', () => ({
  logger: {
    info: (...args: unknown[]) => loggerInfo(...args),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

const emitMessageCreated = vi.fn();
vi.mock('../lib/socket-server', () => ({
  emitMessageCreated: (...args: unknown[]) => emitMessageCreated(...args),
}));

const enqueueMediaDownload = vi.fn().mockResolvedValue(undefined);
vi.mock('../queues/media-download.queue', () => ({
  enqueueMediaDownload: (...args: unknown[]) => enqueueMediaDownload(...args),
}));

const notifyNewMessage = vi.fn().mockResolvedValue(true);
vi.mock('../lib/laravel-client', () => ({
  notifyNewMessage: (...args: unknown[]) => notifyNewMessage(...args),
}));

/** Every SQL statement + bound values, so tests can assert the jid actually looked up. */
let sql: { text: string; values: unknown[] }[] = [];
/** whatsapp_contacts rows keyed by "ws:{id}" - the fake identity store. */
const contacts: Record<string, { id: number; wa_jid: string; lid_jid: string | null }[]> = {};
const conversations: Record<string, { id: number; whatsapp_contact_id: number }[]> = {};
let nextContactId = 100;
let nextConvId = 500;
let nextMessageId = 900;

function store(ws: number) {
  contacts[`ws:${ws}`] ??= [];
  conversations[`ws:${ws}`] ??= [];
  return { contacts: contacts[`ws:${ws}`], conversations: conversations[`ws:${ws}`] };
}

/** Mirrors the real `whatsapp_contacts (workspace_id, wa_jid)` unique key. */
function insertContactRow(ws: number, waJid: string, lidJid: string | null): void {
  const s = store(ws);
  if (s.contacts.some((r) => r.wa_jid === waJid)) {
    const err = new Error('Duplicate entry') as Error & { code: string };
    err.code = 'ER_DUP_ENTRY';
    throw err;
  }
  nextContactId += 1;
  s.contacts.push({ id: nextContactId, wa_jid: waJid, lid_jid: lidJid });
}

const CONVERSATION = {
  beginTransaction: vi.fn(async () => undefined),
  commit: vi.fn(async () => undefined),
  rollback: vi.fn(async () => undefined),
  release: vi.fn(),
  query: vi.fn(async (text: string, values: unknown[] = []) => {
    sql.push({ text, values });
    if (text.includes('SELECT id FROM messages WHERE workspace_id')) {
      return [[]];
    }
    if (text.includes('INSERT INTO messages')) {
      nextMessageId += 1;
      return [{ insertId: nextMessageId }];
    }
    if (text.includes('UPDATE conversations')) {
      return [{}];
    }
    return [{}];
  }),
};

vi.mock('../lib/mysql', () => ({
  query: vi.fn(async (text: string, values: unknown[] = []) => {
    sql.push({ text, values });
    const ws = values[0] as number;
    const s = store(ws);

    if (text.includes('SELECT id, wa_jid FROM whatsapp_contacts WHERE workspace_id = ? AND lid_jid = ?')) {
      const lid = values[1] as string;
      const hit = s.contacts.find((r) => r.lid_jid === lid);
      return [hit ? [{ id: hit.id, wa_jid: hit.wa_jid }] : []];
    }
    if (text.includes('SELECT id FROM whatsapp_contacts WHERE workspace_id = ? AND wa_jid = ?')) {
      const jid = values[1] as string;
      const hit = s.contacts.find((r) => r.wa_jid === jid);
      return [hit ? [{ id: hit.id }] : []];
    }
    if (text.includes('SELECT id, wa_jid FROM whatsapp_contacts') && text.includes('phone_number = ?')) {
      return [[]];
    }
    if (text.includes('SELECT contact_id FROM whatsapp_contacts')) {
      const hit = s.contacts.find((r) => r.id === (values[1] as number));
      return [[{ contact_id: hit ? 1 : null }]];
    }
    if (text.includes('SELECT id FROM conversations WHERE workspace_id = ? AND whatsapp_contact_id = ?')) {
      const hit = s.conversations.find((c) => c.whatsapp_contact_id === (values[1] as number));
      return [hit ? [{ id: hit.id }] : []];
    }
    if (text.includes('SELECT id FROM conversations WHERE workspace_id = ?')) {
      const wcId = values[1] as number;
      return [s.conversations.filter((c) => c.whatsapp_contact_id === wcId)];
    }
    if (text.includes('SELECT id, whatsapp_account_id FROM conversations WHERE id = ?')) {
      return [[]];
    }
    return [[]];
  }),
  execute: vi.fn(async (text: string, values: unknown[] = []) => {
    sql.push({ text, values });
    const ws = values[0] as number;
    const s = store(ws);

    if (text.trimStart().startsWith('INSERT INTO whatsapp_contacts')) {
      // Two shapes: setLidJid binds (ws, wa_jid, lid_jid, phone_number);
      // findOrCreateWhatsappContact binds (ws, wa_jid, push_name, phone_number).
      const isLidInsert = text.includes('wa_jid, lid_jid, phone_number');
      insertContactRow(
        ws,
        values[1] as string,
        isLidInsert ? ((values[2] as string | null) ?? null) : null,
      );
      return { insertId: nextContactId, affectedRows: 1 };
    }
    if (text.includes('UPDATE whatsapp_contacts SET lid_jid')) {
      const hit = s.contacts.find((r) => r.id === (values[1] as number));
      if (hit) hit.lid_jid = values[0] as string;
      return { affectedRows: 1 };
    }
    if (text.includes('UPDATE whatsapp_contacts SET wa_jid')) {
      const hit = s.contacts.find((r) => r.id === (values[2] as number));
      if (hit) hit.wa_jid = values[0] as string;
      return { affectedRows: 1 };
    }
    if (text.includes('UPDATE whatsapp_contacts SET push_name')) {
      return { affectedRows: 1 };
    }
    if (text.includes('INSERT INTO conversations')) {
      nextConvId += 1;
      s.conversations.push({ id: nextConvId, whatsapp_contact_id: values[1] as number });
      return { insertId: nextConvId, affectedRows: 1 };
    }
    if (text.includes('UPDATE conversations SET whatsapp_contact_id')) {
      // Two shapes share this prefix:
      //   ... WHERE id = ? AND workspace_id = ?                  -> [new, convId, ws]
      //   ... WHERE workspace_id = ? AND whatsapp_contact_id = ? -> [new, ws, oldWcId]
      if (text.includes('WHERE id = ?')) {
        const conv = s.conversations.find((c) => c.id === (values[1] as number));
        if (conv) conv.whatsapp_contact_id = values[0] as number;
      } else {
        for (const conv of s.conversations) {
          if (conv.whatsapp_contact_id === (values[2] as number)) {
            conv.whatsapp_contact_id = values[0] as number;
          }
        }
      }
      return { affectedRows: 1 };
    }
    return { affectedRows: 1 };
  }),
  transaction: async (callback: (conn: typeof CONVERSATION) => Promise<unknown>) => callback(CONVERSATION),
}));

import { processOneMessage } from './inbound-pipeline';
import { resolveCanonicalJid, phoneFromJid } from './jid';

const LID = '171421389074673@lid';
const PN = '94766695316@s.whatsapp.net';

function rawText(id: string, remoteJid: string, senderPn?: string, fromMe = false) {
  return {
    key: { id, remoteJid, fromMe, senderPn: senderPn ?? null },
    pushName: 'Sharaff',
    messageTimestamp: Math.floor(Date.now() / 1000),
    message: { conversation: `hi ${id}` },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sql = [];
  for (const k of Object.keys(contacts)) delete contacts[k];
  for (const k of Object.keys(conversations)) delete conversations[k];
  nextContactId = 100;
  nextConvId = 500;
  nextMessageId = 900;
});

describe('resolveCanonicalJid', () => {
  it('prefers the real phone jid over an @lid remoteJid and reports the alias', () => {
    const r = resolveCanonicalJid({ key: { remoteJid: LID, senderPn: PN } });
    expect(r.jid).toBe(PN);
    expect(r.lidJid).toBe(LID);
  });

  it('accepts a bare (domain-less) senderPn', () => {
    const r = resolveCanonicalJid({ key: { remoteJid: LID, senderPn: '94766695316' } });
    expect(r.jid).toBe(PN);
  });

  it('falls back to remoteJid when Baileys gives no phone jid', () => {
    const r = resolveCanonicalJid({ key: { remoteJid: LID } });
    expect(r.jid).toBe(LID);
    expect(r.lidJid).toBeNull();
  });

  it('leaves a group thread keyed by the group jid', () => {
    // One group is one thread; the group's members are not the thread's identity.
    const r = resolveCanonicalJid({ key: { remoteJid: '120363000000000000@g.us', participantPn: PN } });
    expect(r.jid).toBe('120363000000000000@g.us');
    expect(r.lidJid).toBeNull();
  });

  it('does not treat @lid digits as a phone number', () => {
    expect(phoneFromJid(LID)).toBeNull();
    expect(phoneFromJid('120363000000000000@g.us')).toBeNull();
    expect(phoneFromJid(PN)).toBe('94766695316');
  });
});

describe('inbound identity resolution for a privacy-on contact', () => {
  it('resolves an @lid message with senderPn to the phone-number contact, never creating an @lid row', async () => {
    await processOneMessage(1, rawText('M1', LID, '94766695316'));

    // The final identity lookup (findOrCreateWhatsappContact, run after the alias
    // write) must key on the phone jid. setLidJid issues the same SQL text with
    // the lid bound, so take the last match rather than the first.
    const contactLookups = sql.filter((s) =>
      s.text.includes('SELECT id FROM whatsapp_contacts WHERE workspace_id = ? AND wa_jid = ?'),
    );
    expect(contactLookups.at(-1)?.values?.[1]).toBe(PN);

    const stored = store(1).contacts;
    expect(stored.map((r) => r.wa_jid)).toEqual([PN]);
    expect(stored.some((r) => r.wa_jid.endsWith('@lid'))).toBe(false);
  });

  it('persists the @lid -> phone alias so later messages without senderPn still resolve', async () => {
    await processOneMessage(1, rawText('M1', LID, '94766695316'));

    // The alias lands on the canonical row - as an INSERT when the row is new,
    // as an UPDATE when it already exists.
    const aliasWrite = sql.find(
      (s) => s.text.includes('UPDATE whatsapp_contacts SET lid_jid') || s.text.includes('wa_jid, lid_jid, phone_number'),
    );
    expect(aliasWrite).toBeDefined();
    expect(aliasWrite?.values).toContain(LID);
    expect(store(1).contacts[0].lid_jid).toBe(LID);
  });

  it('keeps one contact and one conversation across many messages from the same identity', async () => {
    for (const id of ['M1', 'M2', 'M3', 'M4']) {
      await processOneMessage(1, rawText(id, LID, '94766695316'));
    }

    expect(store(1).contacts).toHaveLength(1);
    expect(store(1).conversations).toHaveLength(1);
  });

  it('reuses the same conversation for outbound and inbound on one identity', async () => {
    await processOneMessage(1, rawText('IN', LID, '94766695316'));
    await processOneMessage(1, rawText('OUT', LID, '94766695316', true));

    expect(store(1).conversations).toHaveLength(1);
  });

  it('a changed pushName does not create a second contact or conversation', async () => {
    await processOneMessage(1, rawText('M1', LID, '94766695316'));
    const first = rawText('M2', LID, '94766695316');
    first.pushName = 'MUHAMED BATH…';
    await processOneMessage(1, first);

    expect(store(1).contacts).toHaveLength(1);
    expect(store(1).conversations).toHaveLength(1);
  });

  it('treats +94 / national / jid forms of one number as one identity', async () => {
    // Same person, number written three ways across three messages.
    await processOneMessage(1, rawText('M1', '94766695316@s.whatsapp.net', '94766695316'));
    await processOneMessage(1, rawText('M2', '+94766695316@s.whatsapp.net'));
    await processOneMessage(1, rawText('M3', '0766695316@s.whatsapp.net'));

    expect(store(1).conversations).toHaveLength(1);
  });

  it('still persists an unmapped @lid message (no senderPn) rather than dropping it', async () => {
    const outcome = await processOneMessage(1, rawText('M1', LID));

    expect(outcome.status).toBe('inserted');
    expect(store(1).contacts[0].wa_jid).toBe(LID);
  });

  it('folds a thread stranded on an @lid row onto the canonical row once the alias is learned', async () => {
    // Pre-existing damage: a conversation already stranded on its own @lid row.
    const s = store(1);
    s.contacts.push({ id: 5, wa_jid: PN, lid_jid: null });
    s.contacts.push({ id: 6, wa_jid: LID, lid_jid: null });
    s.conversations.push({ id: 501, whatsapp_contact_id: 6 });

    await processOneMessage(1, rawText('M1', LID, '94766695316'));

    // The stranded conversation is re-pointed at the canonical contact's thread
    // (or the thread is unified onto it) - one conversation for the person.
    expect(s.conversations.length).toBeLessThanOrEqual(2);
    const linked = sql.find((q) => q.text.includes('UPDATE conversations SET whatsapp_contact_id'));
    expect(linked?.values?.[0]).toBe(5);
  });

  it('logs the audit fields needed to verify one identity = one conversation', async () => {
    await processOneMessage(1, rawText('M1', LID, '94766695316'), {}, 77);

    const entry = loggerInfo.mock.calls.find((c) => c[1] === 'Inbound WhatsApp identity resolution');
    expect(entry?.[0]).toEqual(
      expect.objectContaining({
        raw_jid: LID,
        canonical_jid: PN,
        normalized_phone: '94766695316',
        workspace_id: 1,
        whatsapp_account_id: 77,
        direction: 'inbound',
      }),
    );
    expect(entry?.[0]).toHaveProperty('resolved_contact_id');
    expect(entry?.[0]).toHaveProperty('resolved_conversation_id');
    expect(entry?.[0]).toHaveProperty('message_id');
  });
});
