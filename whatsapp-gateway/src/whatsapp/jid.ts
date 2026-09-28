/**
 * Normalizes an arbitrary phone number into a WhatsApp E.164 user JID
 * ("94750144774@s.whatsapp.net").
 *
 * WhatsApp only routes to the full international number WITHOUT a leading
 * trunk zero. Sending to a local-format number - "0750144774" (leading zero)
 * or "765655026" (no country code) - makes Baileys' sendMessage resolve fine
 * (so we mark the row "sent") while the message never reaches the receiver,
 * because the destination JID doesn't exist on the server.
 *
 * Heuristic (the only ambiguity is whether a short number is national or
 * already includes a short country code; the gateway's account country is the
 * right default, overridable via WHATSAPP_COUNTRY_CODE):
 *   - numbers starting with a trunk zero  -> national: drop the zero, prefix CC
 *   - explicitly E.164 ("+65 6123 4567" / "0065...") -> already international,
 *     use as-is even when under 11 digits (a 10-digit CC is short)
 *   - numbers already starting with the configured CC -> keep as-is
 *   - other numbers shorter than 11 digits -> too short to hold a CC: prefix CC
 *   - anything else                       -> already international, use as-is
 * Group / non-`s.whatsapp.net` JIDs are returned untouched.
 */
export function normalizePhoneToJid(input: string, countryCode = '94'): string {
  if (!input) {
    throw new Error('Cannot build a WhatsApp JID from an empty phone number');
  }

  const atIndex = input.indexOf('@');
  if (atIndex !== -1) {
    const domain = input.slice(atIndex + 1);
    if (domain !== 's.whatsapp.net') {
      return input;
    }
    return normalizePhoneToJid(input.slice(0, atIndex), countryCode);
  }

  const digits = input.replace(/[^0-9]/g, '');
  if (!digits) {
    throw new Error(`Cannot build a WhatsApp JID from "${input}"`);
  }

  const trimmed = input.trim();
  const explicitInternational = trimmed.startsWith('+');

  const cc = countryCode.replace(/[^0-9]/g, '');

  if (digits.startsWith('00')) {
    return `${digits.slice(2)}@s.whatsapp.net`;
  }
  if (explicitInternational) {
    return `${digits}@s.whatsapp.net`;
  }
  if (digits.startsWith('0')) {
    return `${cc}${digits.slice(1)}@s.whatsapp.net`;
  }
  if (digits.startsWith(cc)) {
    return `${digits}@s.whatsapp.net`;
  }
  if (digits.length < 11) {
    return `${cc}${digits}@s.whatsapp.net`;
  }
  return `${digits}@s.whatsapp.net`;
}

/**
 * Extracts the bare phone digits from a jid, or null for anything that isn't a
 * dialable phone-number jid (`@lid` aliases carry opaque digits, groups/broadcast
 * carry ids). Shared by resolveCanonicalJid and the outbound send path.
 */
export function phoneFromJid(jid: string | null | undefined): string | null {
  if (!jid) {
    return null;
  }
  const atIndex = jid.indexOf('@');
  const local = atIndex === -1 ? jid : jid.slice(0, atIndex);
  const domain = atIndex === -1 ? '' : jid.slice(atIndex + 1);
  // Only a real phone-number jid has dialable digits. @lid digits are fake and
  // @g.us/@broadcast digits are ids - treating either as a phone number is what
  // poisons phone-based dedup.
  if (domain !== '' && domain !== 's.whatsapp.net') {
    return null;
  }
  // Tolerate a stray "+" or spaces: canonicalPhoneJid normalizes the digits, and
  // a jid written as "+94766695316@s.whatsapp.net" is the same person as the
  // bare "94766695316@s.whatsapp.net".
  const digits = local.replace(/\D+/g, '');
  return digits === '' ? null : digits;
}

/**
 * Canonicalises a bare phone-digit string into the one jid form the rest of the
 * pipeline keys on, so "+94766695316", "0766695316", "94766695316" and
 * "94766695316@s.whatsapp.net" all collapse to "94766695316@s.whatsapp.net".
 * Returns the input untouched if it cannot be built into a jid.
 */
function canonicalPhoneJid(digits: string): string {
  try {
    return normalizePhoneToJid(digits);
  } catch {
    return `${digits}@s.whatsapp.net`;
  }
}

/**
 * Resolves the canonical identity jid for one raw message.
 *
 * The canonical identity is the sender's REAL phone-number jid whenever Baileys
 * gives us one (`key.senderPn`), and the resulting jid is always canonicalised
 * so every written form of a number collapses to one key. Falls back to
 * `key.remoteJid` when no phone jid is available - but still canonicalised, so
 * a drifted format ("+94..." / national "0...") lands on the same person rather
 * than opening a second row.
 *
 * This matters because `remoteJid` is an `@lid` alias for any contact with
 * phone-number privacy enabled. Keying the whole pipeline off it produces a
 * second whatsapp_contacts row (no phone, no lid_jid alias), a second
 * conversation, and - since the backend refuses to fabricate a CRM contact from
 * an unmapped @lid row - an inbox entry with no contact at all, falling back to
 * the push name. That is the duplicate-contact/double-thread bug.
 *
 * Group chats (`@g.us`) are deliberately left keyed by the group jid: one group
 * is one thread, and the group's members are not the conversation's identity.
 *
 * Returns `{ jid, lidJid }`: when we learned a phone jid for an `@lid`
 * remoteJid, `lidJid` carries the alias so the caller can persist the mapping
 * and every future message (even one without senderPn) resolves too.
 */
export function resolveCanonicalJid(raw: {
  key: { remoteJid?: string | null; senderPn?: string | null; participantPn?: string | null };
}): { jid: string; lidJid: string | null } {
  const remoteJid = raw.key.remoteJid ?? null;
  const senderPn = phoneFromJid(raw.key.senderPn);
  const realPn = senderPn ?? phoneFromJid(raw.key.participantPn);

  // A group thread stays keyed by the group jid - see the note above.
  if (remoteJid && remoteJid.endsWith('@g.us')) {
    return { jid: remoteJid, lidJid: null };
  }

  if (realPn) {
    return {
      jid: canonicalPhoneJid(realPn),
      // Only a direct-chat @lid alias maps back onto this identity.
      lidJid: remoteJid && remoteJid.endsWith('@lid') ? remoteJid : null,
    };
  }

  // No phone jid anywhere: keep the remote jid, canonicalised when it is a
  // phone-number jid in a non-canonical format.
  if (remoteJid) {
    const digits = phoneFromJid(remoteJid);
    if (digits) {
      return { jid: canonicalPhoneJid(digits), lidJid: null };
    }
  }

  return { jid: remoteJid ?? '', lidJid: null };
}
