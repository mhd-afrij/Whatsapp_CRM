<?php

namespace App\Services;

use App\Models\Contact;
use App\Models\ContactActivity;
use App\Models\WhatsappContact;
use App\Support\PhoneNumber;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Log;

/**
 * Lazily provisions a CRM Contact for a WhatsApp-origin identity the first time
 * the backend reads it (spec §5: "The Contact must be created automatically when
 * a previously unknown WhatsApp user messages the business").
 *
 * Why lazy instead of gateway-side: the gateway owns `whatsapp_contacts` and
 * `conversations` (docs/DATA_OWNERSHIP.md) and must never write the backend-owned
 * `contacts` table; gateway -> backend internal calls are not wired in this
 * build. So the first read of an unlinked WhatsApp conversation (inbox list /
 * conversation detail) provisions the CRM contact here, idempotently:
 *
 *   1. If a CRM contact is already linked (whatsapp_contacts.contact_id set),
 *      nothing happens.
 *   2. Otherwise, match by normalized phone number (workspace + normalized
 *      phone is the primary matching strategy, spec §4) and link to an existing
 *      contact rather than creating a duplicate.
 *   3. Only if no match exists is a new Contact created (source = whatsapp).
 *
 * Failures are logged, never thrown - a provisioning hiccup must not break the
 * inbox read that triggered it.
 */
class ContactAutoLinker
{
    public function ensureForConversations(Collection $conversations): void
    {
        foreach ($conversations as $conversation) {
            $whatsappContact = $conversation->relationLoaded('whatsappContact')
                ? $conversation->whatsappContact
                : $conversation->whatsappContact()->first();

            if (! $whatsappContact) {
                continue;
            }

            if ($conversation->contact_id !== null && $whatsappContact->contact_id !== null
                && $whatsappContact->contact_id !== $conversation->contact_id) {
                // The gateway re-keyed this thread onto the canonical PN row
                // (LID resolution, see whatsapp-gateway's setLidJid) whose
                // whatsapp_contact.contact_id is the phone-matched real contact;
                // the conversation still points at the stale LID-fabricated
                // contact. The whatsapp_contact link is canonical - follow it.
                $conversation->forceFill(['contact_id' => $whatsappContact->contact_id])->save();
                $conversation->setRelation('contact', $whatsappContact->contact);
            }

            if ($conversation->contact_id !== null) {
                continue;
            }

            $this->ensureForWhatsappContact($whatsappContact);

            // linkToContact() writes the DB directly without touching the
            // in-memory model, so refresh to read the linked contact_id back.
            // conversation.contact_id is a backend-owned CRM column - keeping
            // it in sync means the inbox/chat resolve the contact's name
            // instead of falling back to the raw WhatsApp number.
            $whatsappContact->refresh();
            if ($conversation->contact_id === null && $whatsappContact->contact_id !== null) {
                $conversation->forceFill(['contact_id' => $whatsappContact->contact_id])->save();
            }
        }
    }

    public function ensureForWhatsappContact(WhatsappContact $whatsappContact): void
    {
        if ($whatsappContact->contact_id !== null) {
            return;
        }

        // LID (Linked ID) jids are WhatsApp's privacy-preserving identity for
        // contacts with phone-number privacy enabled. The numeric part of
        // "176974261706752@lid" is NOT a real phone number, so fabricating a
        // CRM contact from it would poison phone-based dedup matching (the
        // gateway now resolves @lid messages to the canonical phone-number
        // whatsapp_contact via the lid_jid alias - see
        // whatsapp-gateway/src/whatsapp/message-repository.ts). Never create a
        // contact from a LID; if the mapping is already known, inherit the
        // canonical row's contact instead.
        if (str_ends_with($whatsappContact->wa_jid, '@lid')) {
            $canonical = WhatsappContact::query()
                ->where('workspace_id', $whatsappContact->workspace_id)
                ->where('lid_jid', $whatsappContact->wa_jid)
                ->whereNotNull('contact_id')
                ->first();

            if ($canonical) {
                $whatsappContact->linkToContact($canonical->contact);
            }

            return;
        }

        try {
            $phone = $whatsappContact->phone_number ?: (explode('@', $whatsappContact->wa_jid)[0] ?? null);
            $normalized = $phone && preg_match('/\d/', $phone) ? PhoneNumber::normalize($phone) : null;

            // Idempotent upsert: link to an existing CRM contact when the
            // normalized phone already matches (spec §4) instead of duplicating.
            // Archived contacts count too - an archived "Mr Blvck" must still
            // win over fabricating a fresh "MOHAMED BATH..." from the reply's
            // push name. Prefer the active row when both exist (a cleanup pass
            // should have merged any true duplicates), then the earliest.
            $existing = $normalized
                ? Contact::withTrashed()
                    ->where('normalized_phone_number', $normalized)
                    ->orderByRaw('deleted_at IS NULL DESC')
                    ->orderBy('id')
                    ->first()
                : null;

            if ($existing) {
                $whatsappContact->linkToContact($existing);

                return;
            }

            $contact = Contact::create([
                'workspace_id' => $whatsappContact->workspace_id,
                'full_name' => $whatsappContact->contact_name ?: $whatsappContact->push_name,
                'phone_number' => $phone ?: null,
                'status' => Contact::STATUS_ACTIVE,
                'source' => Contact::SOURCE_WHATSAPP,
                'last_contacted_at' => $whatsappContact->last_seen_at ?: now(),
            ]);

            $whatsappContact->linkToContact($contact);

            ContactActivity::create([
                'workspace_id' => $whatsappContact->workspace_id,
                'contact_id' => $contact->id,
                'activity_type' => 'other',
                'description' => 'Contact created from a WhatsApp conversation',
                'occurred_at' => now(),
                'created_by' => null,
            ]);
        } catch (\Throwable $e) {
            Log::warning('Failed to auto-link WhatsApp contact to a CRM contact', [
                'whatsapp_contact_id' => $whatsappContact->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
