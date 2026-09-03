import { PHONE_COUNTRY_CODE } from "./phone";

export interface Country {
  /** ISO 3166-1 alpha-2 country code (e.g. "LK"). */
  code: string;
  name: string;
  /** International dialing code without the leading "+" (e.g. "94"). */
  dial: string;
}

/**
 * Curated dialing-code list covering the regions this CRM serves (WhatsApp is
 * +94 by default, see lib/phone.ts). Order matters for ambiguous single-digit
 * codes: when two countries share a dialing code (+1 US/CA, +7 RU/KZ) the one
 * listed first wins in `detectCountryFromNumber`.
 */
export const COUNTRIES: Country[] = [
  { code: "LK", name: "Sri Lanka", dial: "94" },
  { code: "US", name: "United States", dial: "1" },
  { code: "CA", name: "Canada", dial: "1" },
  // +1 North American Numbering Plan islands - longer codes must win over
  // US/Canada when detected (see detectCountryFromNumber).
  { code: "BB", name: "Barbados", dial: "1246" },
  { code: "BS", name: "Bahamas", dial: "1242" },
  { code: "JM", name: "Jamaica", dial: "1876" },
  { code: "TT", name: "Trinidad and Tobago", dial: "1868" },
  { code: "GB", name: "United Kingdom", dial: "44" },
  { code: "AU", name: "Australia", dial: "61" },
  { code: "NZ", name: "New Zealand", dial: "64" },
  { code: "IN", name: "India", dial: "91" },
  { code: "PK", name: "Pakistan", dial: "92" },
  { code: "BD", name: "Bangladesh", dial: "880" },
  { code: "NP", name: "Nepal", dial: "977" },
  { code: "MV", name: "Maldives", dial: "960" },
  { code: "AF", name: "Afghanistan", dial: "93" },
  { code: "IR", name: "Iran", dial: "98" },
  { code: "IQ", name: "Iraq", dial: "964" },
  { code: "SA", name: "Saudi Arabia", dial: "966" },
  { code: "AE", name: "United Arab Emirates", dial: "971" },
  { code: "QA", name: "Qatar", dial: "974" },
  { code: "KW", name: "Kuwait", dial: "965" },
  { code: "BH", name: "Bahrain", dial: "973" },
  { code: "OM", name: "Oman", dial: "968" },
  { code: "JO", name: "Jordan", dial: "962" },
  { code: "LB", name: "Lebanon", dial: "961" },
  { code: "YE", name: "Yemen", dial: "967" },
  { code: "IL", name: "Israel", dial: "972" },
  { code: "TR", name: "Türkiye", dial: "90" },
  { code: "CY", name: "Cyprus", dial: "357" },
  { code: "EG", name: "Egypt", dial: "20" },
  { code: "MA", name: "Morocco", dial: "212" },
  { code: "DZ", name: "Algeria", dial: "213" },
  { code: "TN", name: "Tunisia", dial: "216" },
  { code: "LY", name: "Libya", dial: "218" },
  { code: "NG", name: "Nigeria", dial: "234" },
  { code: "GH", name: "Ghana", dial: "233" },
  { code: "KE", name: "Kenya", dial: "254" },
  { code: "TZ", name: "Tanzania", dial: "255" },
  { code: "UG", name: "Uganda", dial: "256" },
  { code: "ZA", name: "South Africa", dial: "27" },
  { code: "ET", name: "Ethiopia", dial: "251" },
  { code: "SD", name: "Sudan", dial: "249" },
  { code: "SG", name: "Singapore", dial: "65" },
  { code: "MY", name: "Malaysia", dial: "60" },
  { code: "ID", name: "Indonesia", dial: "62" },
  { code: "PH", name: "Philippines", dial: "63" },
  { code: "TH", name: "Thailand", dial: "66" },
  { code: "VN", name: "Vietnam", dial: "84" },
  { code: "KH", name: "Cambodia", dial: "855" },
  { code: "MM", name: "Myanmar", dial: "95" },
  { code: "LA", name: "Laos", dial: "856" },
  { code: "CN", name: "China", dial: "86" },
  { code: "HK", name: "Hong Kong", dial: "852" },
  { code: "MO", name: "Macau", dial: "853" },
  { code: "TW", name: "Taiwan", dial: "886" },
  { code: "JP", name: "Japan", dial: "81" },
  { code: "KR", name: "South Korea", dial: "82" },
  { code: "MX", name: "Mexico", dial: "52" },
  { code: "BR", name: "Brazil", dial: "55" },
  { code: "AR", name: "Argentina", dial: "54" },
  { code: "CL", name: "Chile", dial: "56" },
  { code: "CO", name: "Colombia", dial: "57" },
  { code: "PE", name: "Peru", dial: "51" },
  { code: "VE", name: "Venezuela", dial: "58" },
  { code: "FR", name: "France", dial: "33" },
  { code: "DE", name: "Germany", dial: "49" },
  { code: "IT", name: "Italy", dial: "39" },
  { code: "ES", name: "Spain", dial: "34" },
  { code: "PT", name: "Portugal", dial: "351" },
  { code: "NL", name: "Netherlands", dial: "31" },
  { code: "BE", name: "Belgium", dial: "32" },
  { code: "CH", name: "Switzerland", dial: "41" },
  { code: "AT", name: "Austria", dial: "43" },
  { code: "SE", name: "Sweden", dial: "46" },
  { code: "NO", name: "Norway", dial: "47" },
  { code: "DK", name: "Denmark", dial: "45" },
  { code: "FI", name: "Finland", dial: "358" },
  { code: "IE", name: "Ireland", dial: "353" },
  { code: "IS", name: "Iceland", dial: "354" },
  { code: "PL", name: "Poland", dial: "48" },
  { code: "CZ", name: "Czech Republic", dial: "420" },
  { code: "SK", name: "Slovakia", dial: "421" },
  { code: "HU", name: "Hungary", dial: "36" },
  { code: "RO", name: "Romania", dial: "40" },
  { code: "BG", name: "Bulgaria", dial: "359" },
  { code: "GR", name: "Greece", dial: "30" },
  { code: "RU", name: "Russia", dial: "7" },
  { code: "KZ", name: "Kazakhstan", dial: "7" },
  { code: "UA", name: "Ukraine", dial: "380" },
  { code: "BY", name: "Belarus", dial: "375" },
  { code: "RS", name: "Serbia", dial: "381" },
  { code: "HR", name: "Croatia", dial: "385" },
  { code: "SI", name: "Slovenia", dial: "386" },
  { code: "BA", name: "Bosnia and Herzegovina", dial: "387" },
  { code: "MK", name: "North Macedonia", dial: "389" },
  { code: "AL", name: "Albania", dial: "355" },
  { code: "LT", name: "Lithuania", dial: "370" },
  { code: "LV", name: "Latvia", dial: "371" },
  { code: "EE", name: "Estonia", dial: "372" },
  { code: "MD", name: "Moldova", dial: "373" },
  { code: "GE", name: "Georgia", dial: "995" },
  { code: "AM", name: "Armenia", dial: "374" },
  { code: "AZ", name: "Azerbaijan", dial: "994" },
  { code: "UZ", name: "Uzbekistan", dial: "998" },
];

/** The country whose dialing code matches the workspace default (+94 / LK). */
export function defaultCountry(dialCode: string = PHONE_COUNTRY_CODE): Country {
  return COUNTRIES.find((c) => c.dial === dialCode) ?? COUNTRIES[0];
}

export interface CountryDetection {
  country: Country;
  /** The remaining digits after stripping the dialing code. */
  national: string;
}

/**
 * Detects which country a phone number belongs to and returns the national
 * part (dialing code stripped). Only values that actually carry a country
 * code are detectable:
 *   - an explicit international number like "+9476502656", or
 *   - an E.164-style number long enough to hold a dialing code (>= 11 digits)
 *     - the backend always stores E.164, so saved numbers qualify.
 * Bare national numbers (< 11 digits, no "+") are left exactly as typed.
 * Longest dialing code wins ("+1246" -> Barbados, not US/CA).
 */
export function detectCountryFromNumber(value: string): CountryDetection | null {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  const explicit = trimmed.startsWith("+");
  if (!explicit && digits.length < 11) return null;

  const match = COUNTRIES.filter((c) => digits.startsWith(c.dial)).sort(
    (a, b) => b.dial.length - a.dial.length
  )[0];
  if (!match) return null;

  return { country: match, national: digits.slice(match.dial.length) };
}
