import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ResultSetHeader } from 'mysql2/promise';

/** Captures the SQL+values handed to the (mocked) mysql layer per call. */
let calls: { sql: string; values?: unknown[] }[] = [];
let nextInsertId = 900;
const table: Record<string, { id: number; wa_jid: string; lid_jid: string | null; phone_number: string | null }[]> =
  {};
/** conversation id ("ws:convId") -> whatsapp_contact_id, for getConversationJid lookups. */
const convToContact: Record<string, number> = {};

function fakeRowsFor(sql: string, values: unknown[] = []): unknown[] {
  if (sql.includes('SELECT wc.wa_jid AS wa_jid, wc.lid_jid AS lid_jid')) {
    const convId = values[0] as number;
    const ws = values[1] as number;
    const contactId = convToContact[`${ws}:${convId}`];
    const row = (table[`ws:${ws}`] ?? []).find((r) => r.id === contactId);
    return row ? [{ wa_jid: row.wa_jid, lid_jid: row.lid_jid }] : [];
  }
  const ws = values[0] as number;
  const rows = table[`ws:${ws}`] ?? [];
  if (sql.includes('WHERE workspace_id = ? AND lid_jid = ?')) {
    const lid = values[1] as string;
    return rows.filter((r) => r.lid_jid === lid).map((r) => ({ id: r.id, wa_jid: r.wa_jid }));
  }
  if (sql.includes('WHERE workspace_id = ? AND wa_jid = ?')) {
    const jid = values[1] as string;
    const hit = rows.find((r) => r.wa_jid === jid);
    return hit ? [{ id: hit.id }] : [];
  }
  if (sql.includes('AND phone_number = ? AND wa_jid != ?')) {
    const phone = values[1] as string;
    const jid = values[2] as string;
    const hit = rows.find((r) => r.phone_number === phone && r.wa_jid !== jid);
    return hit ? [{ id: hit.id, wa_jid: hit.wa_jid }] : [];
  }
  if (sql.includes('SELECT id FROM conversations WHERE workspace_id = ? AND whatsapp_contact_id = ?')) {
    // No PN conversation exists by default - force the re-key branch.
    return [];
  }
  return [];
}

vi.mock('../lib/mysql', () => ({
  query: vi.fn(async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values });
    return [fakeRowsFor(sql, values ?? [])];
  }),
  execute: vi.fn(async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values });
    if (sql.trimStart().startsWith('INSERT INTO whatsapp_contacts')) {
      nextInsertId += 1;
      return { insertId: nextInsertId, affectedRows: 1 } as ResultSetHeader;
    }
    if (sql.includes('UPDATE conversations SET whatsapp_contact_id')) {
      return { affectedRows: 1 } as ResultSetHeader;
    }
    if (sql.includes('UPDATE whatsapp_contacts SET lid_jid')) {
      return { affectedRows: 1 } as ResultSetHeader;
    }
    if (sql.includes('UPDATE whatsapp_contacts SET push_name')) {
      return { affectedRows: 1 } as ResultSetHeader;
    }
    if (sql.includes('INSERT INTO conversations')) {
      nextInsertId += 1;
      return { insertId: nextInsertId, affectedRows: 1 } as ResultSetHeader;
    }
    return { affectedRows: 1 } as ResultSetHeader;
  }),
}));

import { MessageRepository } from './message-repository';

const repo = new MessageRepository();

beforeEach(() => {
  calls = [];
  nextInsertId = 900;
  for (const k of Object.keys(table)) delete table[k];
  for (const k of Object.keys(convToContact)) delete convToContact[k];
  // Seed: PN row for the saved contact + its LID alias mapped via lid_jid.
  table['ws:1'] = [
    { id: 2, wa_jid: '94750144774@s.whatsapp.net', lid_jid: '176974261706752@lid', phone_number: '94750144774' },
    { id: 874, wa_jid: '176974261706752@lid', lid_jid: null, phone_number: null },
  ];
});

describe('findOrCreateWhatsappContact LID resolution', () => {
  it('resolves an inbound @lid jid to the canonical phone-number row via lid_jid', async () => {
    const result = await repo.findOrCreateWhatsappContact(1, '176974261706752@lid', 'Aazik Ahmed');

    expect(result.id).toBe(2);
    // The canonical row's push_name is refreshed, and no new row is inserted.
    const pushUpdate = calls.find((c) => c.sql.includes('UPDATE whatsapp_contacts SET push_name'));
    expect(pushUpdate?.values?.[0]).toBe('Aazik Ahmed');
    expect(calls.some((c) => c.sql.includes('INSERT INTO whatsapp_contacts'))).toBe(false);
  });

  it('keeps an unmapped LID jid as its own row with NULL phone_number (no fake number stored)', async () => {
    table['ws:1'] = table['ws:1'].filter((r) => !r.wa_jid.endsWith('@lid'));

    const result = await repo.findOrCreateWhatsappContact(1, '99961152790578@lid', 'Abdullah Faris');

    const insert = calls.find((c) => c.sql.includes('INSERT INTO whatsapp_contacts'));
    expect(insert).toBeDefined();
    expect(insert?.values).toEqual([1, '99961152790578@lid', 'Abdullah Faris', null]);
    expect(result.id).toBe(901);
  });

  it('does not create a self-referencing lid_jid on a plain row', async () => {
    await repo.findOrCreateWhatsappContact(1, '94765655026@s.whatsapp.net', 'Mohamed Afrij');

    const lidUpdates = calls.filter((c) => c.sql.includes('SET lid_jid'));
    expect(lidUpdates).toHaveLength(0);
  });

  it('reuses a row with the same phone number when the jid drifted, healing the jid', async () => {
    // A legacy row exists under a bare jid (no @s.whatsapp.net domain) while
    // the inbound message arrives with the canonical jid - the phone number is
    // the same person, so no new row may be created.
    table['ws:1'] = [
      { id: 2, wa_jid: '94750144774', lid_jid: null, phone_number: '94750144774' },
    ];

    const result = await repo.findOrCreateWhatsappContact(1, '94750144774@s.whatsapp.net', 'Aazik Ahmed');

    expect(result.id).toBe(2);
    const heal = calls.find((c) => c.sql.includes('SET wa_jid = ?'));
    expect(heal?.values?.[0]).toBe('94750144774@s.whatsapp.net');
    expect(heal?.values?.[1]).toBe('Aazik Ahmed');
    expect(calls.some((c) => c.sql.includes('INSERT INTO whatsapp_contacts'))).toBe(false);
  });

  it('does not reuse a LID-only row via the phone fallback (fake numbers must never win)', async () => {
    // Pre-fix data: a LID row carrying a fabricated 15-digit "phone" number.
    // An inbound PN jid for the same digits must NOT match it.
    table['ws:1'] = [
      { id: 2, wa_jid: '176974261706752@lid', lid_jid: null, phone_number: '176974261706752' },
    ];

    const result = await repo.findOrCreateWhatsappContact(1, '94750144774@s.whatsapp.net', 'Aazik Ahmed');

    // No reuse - a fresh PN row is inserted instead.
    const insert = calls.find((c) => c.sql.includes('INSERT INTO whatsapp_contacts'));
    expect(insert).toBeDefined();
    expect(result.id).not.toBe(2);
  });
});

describe('setLidJid', () => {
  it('persists the lid_jid alias on the canonical PN row', async () => {
    await repo.setLidJid(1, '94750144774@s.whatsapp.net', '176974261706752@lid');

    const update = calls.find((c) => c.sql.includes('UPDATE whatsapp_contacts SET lid_jid'));
    expect(update?.values).toEqual(['176974261706752@lid', 2]);
  });

  it('re-keys conversations stranded on a LID-only row onto the PN row', async () => {
    table['ws:1'] = [
      { id: 2, wa_jid: '94750144774@s.whatsapp.net', lid_jid: null, phone_number: '94750144774' },
      { id: 874, wa_jid: '176974261706752@lid', lid_jid: null, phone_number: null },
    ];
    // Force the "no PN conversation" branch: fakeRowsFor returns [] for conv lookups.
    await repo.setLidJid(1, '94750144774@s.whatsapp.net', '176974261706752@lid');

    const rekey = calls.find((c) => c.sql.includes('UPDATE conversations SET whatsapp_contact_id'));
    expect(rekey).toBeDefined();
    expect(rekey?.values).toEqual([2, 1, 874]);
  });
});

describe('getConversationJid (outbound addressing)', () => {
  it('prefers the contact LID when the row has one', async () => {
    convToContact['1:13'] = 2;

    const jid = await repo.getConversationJid(13, 1);

    expect(jid).toBe('176974261706752@lid');
  });

  it('falls back to the phone-number jid when no LID is known', async () => {
    table['ws:1'] = [{ id: 3, wa_jid: '94755555555@s.whatsapp.net', lid_jid: null, phone_number: '94755555555' }];
    convToContact['1:14'] = 3;

    const jid = await repo.getConversationJid(14, 1);

    expect(jid).toBe('94755555555@s.whatsapp.net');
  });

  it('addresses an unmapped LID-only conversation by its LID', async () => {
    // Conversation stranded on a LID-only row whose phone mapping is unknown.
    convToContact['1:15'] = 874;

    const jid = await repo.getConversationJid(15, 1);

    expect(jid).toBe('176974261706752@lid');
  });

  it('returns null when the conversation does not exist', async () => {
    expect(await repo.getConversationJid(999, 1)).toBeNull();
  });
});
