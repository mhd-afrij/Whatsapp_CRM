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
 *   - numbers shorter than 11 digits      -> too short to hold a CC: prefix CC
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

  const cc = countryCode.replace(/[^0-9]/g, '');

  if (digits.startsWith('0')) {
    return `${cc}${digits.slice(1)}@s.whatsapp.net`;
  }
  if (digits.length < 11) {
    return `${cc}${digits}@s.whatsapp.net`;
  }
  return `${digits}@s.whatsapp.net`;
}
