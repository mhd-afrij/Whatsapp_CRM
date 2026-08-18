import { logger } from '../lib/logger';
import { MessageRepository } from './message-repository';
import type { BaileysContactsUpsert } from './baileys-socket';

const repository = new MessageRepository();

/**
 * Syncs saved (address-book) contact names from Baileys' `contacts.upsert`
 * events into `whatsapp_contacts.contact_name`, so the CRM UI can show the
 * name the user saved in WhatsApp instead of falling back to the phone
 * number. Rows are upserted by the (workspace_id, wa_jid) unique key;
 * contacts without a saved name are skipped (the push/profile name path is
 * handled per-message in the inbound pipeline).
 */
export async function handleContactsUpsert(
  workspaceId: number,
  payload: BaileysContactsUpsert,
): Promise<void> {
  for (const contact of payload) {
    const contactName = contact.name?.trim();
    if (!contactName) continue;

    try {
      await repository.upsertContactName(workspaceId, contact.id, contactName);
    } catch (err) {
      logger.error({ err, workspaceId, waJid: contact.id }, 'Failed to upsert saved contact name');
    }
  }
}
