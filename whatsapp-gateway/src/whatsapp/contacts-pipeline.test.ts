import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleContactsUpsert } from './contacts-pipeline';
import type { BaileysContactsUpsert } from './baileys-socket';

const mocks = vi.hoisted(() => ({
  setLidJid: vi.fn(async () => {}),
  upsertContactName: vi.fn(async () => {}),
}));

vi.mock('./message-repository', () => ({
  MessageRepository: class {
    setLidJid = mocks.setLidJid;
    upsertContactName = mocks.upsertContactName;
  },
}));

const contact = (overrides: Record<string, unknown> = {}): NonNullable<BaileysContactsUpsert[number]> => ({
  id: '94752112249@s.whatsapp.net',
  jid: '94752112249@s.whatsapp.net',
  lid: '176974261706752@lid',
  name: 'Mohamed Suraimy',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleContactsUpsert', () => {
  it('maps a normal contact: persists the LID alias and the saved name against the PN jid', async () => {
    await handleContactsUpsert(1, [contact()]);

    expect(mocks.setLidJid).toHaveBeenCalledWith(1, '94752112249@s.whatsapp.net', '176974261706752@lid');
    expect(mocks.upsertContactName).toHaveBeenCalledWith(1, '94752112249@s.whatsapp.net', 'Mohamed Suraimy');
  });

  it('rejects an @lid jid surfaced on contact.jid (no poisoned whatsapp_contacts row)', async () => {
    // Pre-fix, this payload wrote a second whatsapp_contacts row keyed by the
    // @lid jid with phone_number = fake LID digits - the duplicate contact/
    // duplicate thread root cause. The sync must now skip the alias entirely.
    await handleContactsUpsert(1, [
      contact({ id: '176974261706752@lid', jid: '176974261706752@lid', lid: '176974261706752@lid' }),
    ]);

    expect(mocks.setLidJid).not.toHaveBeenCalled();
    expect(mocks.upsertContactName).not.toHaveBeenCalled();
  });

  it('rejects an @lid jid on contact.id too, even when jid is absent', async () => {
    await handleContactsUpsert(1, [
      contact({ id: '176974261706752@lid', jid: null, lid: undefined, name: 'Suraimy' }),
    ]);

    expect(mocks.setLidJid).not.toHaveBeenCalled();
    expect(mocks.upsertContactName).not.toHaveBeenCalled();
  });

  it('keeps a bare phone number working as a jid', async () => {
    await handleContactsUpsert(1, [contact({ id: '94752112249', jid: '94752112249' })]);

    expect(mocks.upsertContactName).toHaveBeenCalledWith(1, '94752112249', 'Mohamed Suraimy');
  });
});