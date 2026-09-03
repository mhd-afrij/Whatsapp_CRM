<?php

namespace App\Support;

/**
 * Backend mirror of the gateway's `normalizePhoneToJid` (whatsapp-gateway/src/whatsapp/jid.ts)
 * and the frontend's `normalizePhoneNumber` (frontend/src/lib/phone.ts). Every service must
 * agree on what "the same number" means or dedup breaks across the stack.
 *
 * Rules (identical to the frontend/gateway implementations):
 *   - numbers starting with a trunk zero  -> national: drop the zero, prefix CC
 *   - numbers shorter than 11 digits      -> too short to hold a CC: prefix CC
 *   - anything else                       -> already international, as-is
 * Returns the trimmed input unchanged when it has no digits.
 */
class PhoneNumber
{
    public static function normalize(string $input, ?string $countryCode = null): string
    {
        $trimmed = trim($input);
        $digits = preg_replace('/\D+/', '', $trimmed) ?? '';

        if ($digits === '') {
            return $trimmed;
        }

        $cc = preg_replace('/\D+/', '', (string) ($countryCode ?? config('services.whatsapp_gateway.country_code', '94')));
        $cc = $cc !== '' ? $cc : '94';

        if (str_starts_with($digits, '0')) {
            return $cc.substr($digits, 1);
        }

        if (strlen($digits) < 11) {
            return $cc.$digits;
        }

        return $digits;
    }
}
