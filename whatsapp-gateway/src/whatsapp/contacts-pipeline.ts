import { logger } from '../lib/logger';
import { MessageRepository } from './message-repository';
import type { BaileysContactsUpsert, BaileysPhoneNumberShare } from './baileys-socket';

const repository = new MessageRepository();

/**
 * Syncs saved (address-book) contact names from Baileys' `contacts.upsert`
 * events into `whatsapp_contacts.contact_name`, so the CRM UI can show the
 * name the user saved in WhatsApp instead of falling back to the phone
 * number. Rows are upserted by the (workspace_id, wa_jid) unique key;
 * contacts without a saved name are skipped (the push/profile name path is
 * handled per-message in the inbound pipeline).
 *
 * The same payload is also the primary source for the LID (Linked ID) ->
 * phone-number mapping: each address-book `Contact` carries both `jid` (the
 * real phone jid) and `lid` (the opaque @lid alias used in inbound
 * remoteJids when the contact has phone-number privacy enabled). Persisting
 * that mapping via setLidJid() is what lets inbound @lid replies resolve to
 * the same whatsapp_contact/conversation the business messaged, instead of
 * splitting one person into two identities.
 */
export async function handleContactsUpsert(
  workspaceId: number,
  payload: BaileysContactsUpsert,
): Promise<void> {
  for (const contact of payload) {
    const contactName = contact.name?.trim();
    const jid = contact.jid ?? (contact.id && !contact.id.endsWith('@lid') ? contact.id : null);

    if (!jid) {
      continue;
    }

    try {
      if (contact.lid && contact.lid.endsWith('@lid')) {
        await repository.setLidJid(workspaceId, jid, contact.lid);
      }
      if (contactName) {
        await repository.upsertContactName(workspaceId, jid, contactName);
      }
    } catch (err) {
      logger.error({ err, workspaceId, waJid: contact.id }, 'Failed to sync WhatsApp contact (LID mapping / saved name)');
    }
  }
}

/**
 * Persists the LID -> phone-number mapping from Baileys' `chats.phoneNumberShare`
 * event (fires when WhatsApp shares the real number behind a LID alias), so
 * inbound @lid messages resolve to the canonical phone-number contact.
 */
export async function handlePhoneNumberShare(
  workspaceId: number,
  payload: BaileysPhoneNumberShare,
): Promise<void> {
  try {
    await repository.setLidJid(workspaceId, payload.jid, payload.lid);
  } catch (err) {
    logger.error({ err, workspaceId, lid: payload.lid, jid: payload.jid }, 'Failed to persist LID phone-number share');
  }
}
