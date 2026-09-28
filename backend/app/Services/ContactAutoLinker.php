<?php

namespace App\Services;

use App\Models\Contact;
use App\Models\ContactActivity;
use App\Models\Conversation;
use App\Models\Scopes\WorkspaceScope;
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
                : $this->resolveWhatsappContact($conversation);

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
                // Spec §3: this phone number already resolved to a contact and
                // its conversation - reuse both as-is; never split one number
                // into a second thread because the pushName changed.
                $this->logResolution($conversation, $whatsappContact, 'reuse_existing_conversation');

                continue;
            }

            $action = $this->ensureForWhatsappContact($whatsappContact);

            // linkToContact() writes the DB directly without touching the
            // in-memory model, so refresh to read the linked contact_id back.
            // conversation.contact_id is a backend-owned CRM column - keeping
            // it in sync means the inbox/chat resolve the contact's name
            // instead of falling back to the raw WhatsApp number.
            $whatsappContact->refresh();
            if ($conversation->contact_id === null && $whatsappContact->contact_id !== null) {
                $conversation->forceFill(['contact_id' => $whatsappContact->contact_id])->save();
            }

            $this->logResolution($conversation, $whatsappContact, $action);
        }
    }

    /**
     * Returns which identity-resolution action was taken so callers can log it
     * (spec §7): already_linked | reuse_existing_contact | create_new_contact |
     * unresolved. Never throws (spec §5 - a provisioning hiccup must not break
     * the read that triggered it).
     */
    public function ensureForWhatsappContact(WhatsappContact $whatsappContact): string
    {
        if ($whatsappContact->contact_id !== null) {
            return 'already_linked';
        }

        // LID (Linked ID) jids are WhatsApp's privacy-preserving identity for
        // contacts with phone-number privacy enabled. The numeric part of
        // "176974261706752@lid" is NOT a real phone number, so fabricating a
        // CRM contact from it would poison phone-based dedup matching (the
        // gateway now resolves @lid messages to the canonical phone-number
        // whatsapp_contact via the lid_jid alias - see
        // whatsapp-gateway/src/whatsapp/message-repository.ts). When the
        // customer shares their real number (SHARE_PHONE_NUMBER protocol
        // message, surfaced as whatsapp_contacts.phone_number), that value IS
        // real and we fall through to the phone-based provisioning below.
        if (str_ends_with($whatsappContact->wa_jid, '@lid')) {
            $canonical = WhatsappContact::query()
                ->where('workspace_id', $whatsappContact->workspace_id)
                ->where('lid_jid', $whatsappContact->wa_jid)
                ->whereNotNull('contact_id')
                ->first();

            if ($canonical) {
                $whatsappContact->linkToContact($canonical->contact);

                return 'reuse_existing_contact';
            }

            if (! $whatsappContact->phone_number) {
                return 'unresolved';
            }
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
            // Workspace-explicit AND scope-free: the gateway notify path runs
            // without an authenticated user, where WorkspaceScope resolves no
            // workspace and would leave this lookup floating across tenants
            // (while an inbox read would constrain it to the viewer's
            // workspace). Same phone number, same workspace = same contact.
            $existing = $normalized
                ? Contact::withoutGlobalScope(WorkspaceScope::class)
                    ->withTrashed()
                    ->where('workspace_id', $whatsappContact->workspace_id)
                    ->where('normalized_phone_number', $normalized)
                    ->orderByRaw('deleted_at IS NULL DESC')
                    ->orderBy('id')
                    ->first()
                : null;

            if ($existing) {
                // Spec §2: reuse the existing contact. The display name is only
                // filled in when the stored one is empty - a pushName/profile
                // change must never duplicate or override a saved name.
                if (blank($existing->full_name)) {
                    $existing->forceFill([
                        'full_name' => $whatsappContact->contact_name ?: $whatsappContact->push_name,
                    ])->save();
                }
                $whatsappContact->linkToContact($existing);

                return 'reuse_existing_contact';
            }

            try {
                $contact = Contact::create([
                    'workspace_id' => $whatsappContact->workspace_id,
                    'full_name' => $whatsappContact->contact_name ?: $whatsappContact->push_name,
                    'phone_number' => $phone ?: null,
                    'status' => Contact::STATUS_ACTIVE,
                    'source' => Contact::SOURCE_WHATSAPP,
                    'last_contacted_at' => $whatsappContact->last_seen_at ?: now(),
                ]);
            } catch (\Illuminate\Database\QueryException $e) {
                // Lost a race to a concurrent inbox read: a sibling request
                // already created this (workspace, normalized_phone_number).
                // Link to their row instead of leaving a duplicate behind (the
                // UNIQUE index added alongside the dedup cleanup is the backstop).
                if (($e->errorInfo[0] ?? null) !== '23000') {
                    throw $e;
                }
                $existing = $normalized
                    ? Contact::withoutGlobalScope(WorkspaceScope::class)
                        ->withTrashed()
                        ->where('workspace_id', $whatsappContact->workspace_id)
                        ->where('normalized_phone_number', $normalized)
                        ->orderByRaw('deleted_at IS NULL DESC')
                        ->orderBy('id')
                        ->first()
                    : null;
                if (! $existing) {
                    throw $e;
                }

                $whatsappContact->linkToContact($existing);

                return 'reuse_existing_contact';
            }

            $whatsappContact->linkToContact($contact);

            ContactActivity::create([
                'workspace_id' => $whatsappContact->workspace_id,
                'contact_id' => $contact->id,
                'activity_type' => 'other',
                'description' => 'Contact created from a WhatsApp conversation',
                'occurred_at' => now(),
                'created_by' => null,
            ]);

            return 'create_new_contact';
        } catch (\Throwable $e) {
            Log::warning('Failed to auto-link WhatsApp contact to a CRM contact', [
                'whatsapp_contact_id' => $whatsappContact->id,
                'error' => $e->getMessage(),
            ]);

            return 'unresolved';
        }
    }

    /**
     * Workspace-explicit, scope-free fetch of a conversation's WhatsApp
     * identity. WorkspaceScope adds no filter when there is no authenticated
     * user (the gateway notify path), so the trait's relation query alone is
     * not enough - always pin workspace_id explicitly (spec §5).
     */
    protected function resolveWhatsappContact(Conversation $conversation): ?WhatsappContact
    {
        if ($conversation->whatsapp_contact_id === null) {
            return null;
        }

        return WhatsappContact::withoutGlobalScope(WorkspaceScope::class)
            ->where('workspace_id', $conversation->workspace_id)
            ->whereKey($conversation->whatsapp_contact_id)
            ->first();
    }

    /**
     * Spec §7 debugging log: one structured line per conversation resolution so
     * duplicate-contact/conversation reports can be diagnosed from the logs
     * alone. pushName is deliberately absent as a matching key - only the
     * normalized phone number identifies the customer (spec §1).
     */
    protected function logResolution(Conversation $conversation, WhatsappContact $whatsappContact, string $action): void
    {
        $phone = $whatsappContact->phone_number;
        if (! $phone && ! str_ends_with($whatsappContact->wa_jid, '@lid')) {
            $phone = explode('@', $whatsappContact->wa_jid)[0] ?? null;
        }
        $normalized = $phone && preg_match('/\d/', $phone) ? PhoneNumber::normalize($phone) : null;

        Log::info('WhatsApp contact/conversation identity resolution', [
            'phone_received' => $phone,
            'normalized_phone' => $normalized,
            'contact_found' => $conversation->contact_id !== null,
            'contact_id' => $conversation->contact_id,
            'conversation_found' => true,
            'conversation_id' => $conversation->id,
            'action' => $action,
            'workspace_id' => $conversation->workspace_id,
        ]);
    }
}
