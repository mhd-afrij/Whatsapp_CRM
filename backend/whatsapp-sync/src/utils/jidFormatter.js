/**
 * Format a phone number into a WhatsApp JID (Jabber ID).
 * @param {string} phone - Phone number string
 * @returns {string} WhatsApp JID
 */
export function formatJid(phone) {
  const cleaned = phone.replace(/[^0-9]/g, "");
  return `${cleaned}@s.whatsapp.net`;
}

/**
 * Extract phone number from a JID.
 * @param {string} jid - WhatsApp JID
 * @returns {string} Phone number
 */
export function jidToPhone(jid) {
  return jid.replace(/@.*$/, "");
}

/**
 * Check if a JID is a group JID.
 * @param {string} jid
 * @returns {boolean}
 */
export function isGroupJid(jid) {
  return jid.endsWith("@g.us");
}

/**
 * Check if a JID is a user JID.
 * @param {string} jid
 * @returns {boolean}
 */
export function isUserJid(jid) {
  return jid.endsWith("@s.whatsapp.net");
}
