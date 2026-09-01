/**
 * Default dialing code for local-format phone numbers, matching the gateway's
 * WHATSAPP_COUNTRY_CODE (the WhatsApp account this CRM pairs with is a +94
 * Sri Lankan number). Mirrors whatsapp-gateway/src/whatsapp/jid.ts.
 */
export const PHONE_COUNTRY_CODE = process.env.NEXT_PUBLIC_WHATSAPP_COUNTRY_CODE ?? "94";

/**
 * Normalizes an arbitrary phone number to E.164 digits only
 * ("94750144774"). WhatsApp only routes to the full international number
 * without a leading trunk zero, so a bare local number like "0750144774" or
 * "765655026" can never receive a message. Rules:
 *   - numbers starting with a trunk zero  -> national: drop the zero, prefix CC
 *   - numbers shorter than 11 digits      -> too short to hold a CC: prefix CC
 *   - anything else                       -> already international, as-is
 * Returns the trimmed input unchanged when it has no digits.
 */
export function normalizePhoneNumber(input: string, countryCode = PHONE_COUNTRY_CODE): string {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return trimmed;

  const cc = countryCode.replace(/\D/g, "");
  if (digits.startsWith("0")) return `${cc}${digits.slice(1)}`;
  if (digits.length < 11) return `${cc}${digits}`;
  return digits;
}
