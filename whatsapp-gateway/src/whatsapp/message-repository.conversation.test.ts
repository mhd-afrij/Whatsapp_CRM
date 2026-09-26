import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ResultSetHeader } from 'mysql2/promise';

/** Captures the SQL+values handed to the (mocked) mysql layer per call. */
let calls: { sql: string; values?: unknown[] }[] = [];
let nextInsertId = 500;

interface FakeConversation {
  id: number;
  workspace_id: number;
  whatsapp_contact_id: number | null;
  contact_id: number | null;
  status: string;
}

let conversations: FakeConversation[] = [];
/** whatsapp_contact id -> CRM contact link, for the contact-level lookup. */
let contactLinks: Record<number, { workspace_id: number; contact_id: number | null }> = {};

vi.mock('../lib/mysql', () => ({
  query: vi.fn(async (sql: string, values: unknown[] = []) => {
    calls.push({ sql, values });
    // mysql2/promise shape: query() resolves to [rows] - the repository
    // destructures `const [rows] = await query(...)`.
    if (sql.includes('SELECT id FROM conversations WHERE workspace_id = ? AND whatsapp_contact_id = ?')) {
      const [ws, wcId] = values as [number, number];
      return [
        conversations
          .filter((c) => c.workspace_id === ws && c.whatsapp_contact_id === wcId)
          .map((c) => ({ id: c.id })),
      ];
    }
    if (sql.includes('SELECT contact_id FROM whatsapp_contacts WHERE workspace_id = ? AND id = ?')) {
      const [ws, id] = values as [number, number];
      const row = contactLinks[id];
      return [row && row.workspace_id === ws ? [{ contact_id: row.contact_id }] : []];
    }
    if (sql.includes('AND contact_id = ? AND status IN')) {
      const [ws, contactId] = values as [number, number];
      return [
        conversations
          .filter((c) => c.workspace_id === ws && c.contact_id === contactId && (c.status === 'open' || c.status === 'pending'))
          .map((c) => ({ id: c.id })),
      ];
    }
    return [[]];
  }),
  execute: vi.fn(async (sql: string, values: unknown[] = []) => {
    calls.push({ sql, values });
    if (sql.includes('INSERT INTO conversations')) {
      nextInsertId += 1;
      const wcId = values[1] as number;
      conversations.push({
        id: nextInsertId,
        workspace_id: values[0] as number,
        whatsapp_contact_id: wcId,
        contact_id: contactLinks[wcId]?.contact_id ?? null,
        status: 'open',
      });
      return { insertId: nextInsertId, affectedRows: 1 } as ResultSetHeader;
    }
    if (sql.includes('UPDATE conversations SET whatsapp_contact_id')) {
      const [wcId, convId] = values as [number, number];
      const conv = conversations.find((c) => c.id === convId);
      if (conv) conv.whatsapp_contact_id = wcId;
      return { affectedRows: 1 } as ResultSetHeader;
    }
    return { affectedRows: 1 } as ResultSetHeader;
  }),
}));

import { MessageRepository } from './message-repository';

const repo = new MessageRepository();

beforeEach(() => {
  calls = [];
  nextInsertId = 500;
  conversations = [];
  contactLinks = {};
});

describe('findOrCreateConversation (spec §3: phone number = unique identity)', () => {
  it('reuses the whatsapp_contact own thread regardless of contact link state', async () => {
    conversations = [
      { id: 7, workspace_id: 1, whatsapp_contact_id: 3, contact_id: null, status: 'open' },
    ];

    const result = await repo.findOrCreateConversation(1, 3, 11);

    expect(result).toEqual({ id: 7, created: false });
    expect(calls.some((c) => c.sql.includes('INSERT INTO conversations'))).toBe(false);
  });

  it('claims an existing ACTIVE conversation of the same CRM contact instead of creating a duplicate', async () => {
    // Legacy state: two whatsapp_contacts rows for ONE human. Row A already
    // owns conversation 9 (linked to contact 55); inbound for row B must
    // attach to 9, not fabricate a second thread.
    contactLinks[3] = { workspace_id: 1, contact_id: 55 };
    conversations = [
      { id: 9, workspace_id: 1, whatsapp_contact_id: 8, contact_id: 55, status: 'open' },
    ];

    const result = await repo.findOrCreateConversation(1, 3, 11);

    expect(result).toEqual({ id: 9, created: false });
    const claim = calls.find((c) => c.sql.includes('UPDATE conversations SET whatsapp_contact_id'));
    expect(claim?.values).toEqual([3, 9, 1]);
    expect(calls.some((c) => c.sql.includes('INSERT INTO conversations'))).toBe(false);
  });

  it('creates a new conversation when the contact only has CLOSED threads', async () => {
    contactLinks[3] = { workspace_id: 1, contact_id: 55 };
    conversations = [
      { id: 9, workspace_id: 1, whatsapp_contact_id: null, contact_id: 55, status: 'closed' },
    ];

    const result = await repo.findOrCreateConversation(1, 3, 11);

    expect(result.created).toBe(true);
    expect(result.id).toBe(501);
    expect(conversations.find((c) => c.id === 501)?.whatsapp_contact_id).toBe(3);
  });

  it('creates a new conversation for an unlinked whatsapp_contact (first message ever)', async () => {
    const result = await repo.findOrCreateConversation(1, 3, null);

    expect(result).toEqual({ id: 501, created: true });
    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      workspace_id: 1,
      whatsapp_contact_id: 3,
      status: 'open',
    });
  });
});
