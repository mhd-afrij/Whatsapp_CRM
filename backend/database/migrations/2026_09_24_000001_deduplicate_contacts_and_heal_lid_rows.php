<?php

use App\Models\Contact;
use App\Services\ContactDeduplicator;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * One-time cleanup that makes "one WhatsApp user = one CRM contact" a DB-level
 * invariant instead of a best-effort runtime match:
 *
 *   1. Merges existing duplicate contacts (same normalized phone) via the
 *      existing ContactDeduplicator - keeps the earliest/manually-saved row,
 *      re-points whatsapp_contacts/conversations/deals/tasks/notes/leads/labels,
 *      hard-deletes the victims.
 *   2. Heals "@lid-poisoned" whatsapp_contacts rows. These were created before
 *      the gateway rejected @lid jids in the address-book sync: wa_jid = X@lid
 *      with phone_number = the (fake) LID digits. Each such row owns a second
 *      conversation + fabricates a second CRM contact. Their conversation is
 *      folded onto the canonical phone-number row (lid_jid alias), the fake
 *      contact is merged into the real one, and the poisoned row is deleted.
 *   3. Adds UNIQUE (workspace_id, active_phone_key) on contacts via a stored
 *      generated column so no two *active* contacts can share one number. The
 *      key is NULL for soft-deleted (archived) rows, so the legitimate
 *      archive-then-restore / duplicate-flagged coexistence of an archived and
 *      an active row for one number keeps working (a plain UNIQUE on
 *      normalized_phone_number would wrongly block restore).
 *
 * Destructive: re-runs are safe (dedup finds nothing, poisoned rows are gone),
 * but run with a backup if the workspace has hand-curated duplicate rows.
 */
return new class extends Migration
{
    public function up(): void
    {
        $deduplicator = app(ContactDeduplicator::class);

        DB::table('workspaces')->pluck('id')->each(function (int $workspaceId) use ($deduplicator) {
            $this->mergePhoneDuplicates($workspaceId, $deduplicator);
            $this->healLidPoisonedRows($workspaceId, $deduplicator);
        });

        Schema::table('contacts', function (Blueprint $table) {
            $table->string('active_phone_key', 32)
                ->nullable()
                ->storedAs("CASE WHEN deleted_at IS NULL THEN normalized_phone_number ELSE NULL END");
            $table->unique(['workspace_id', 'active_phone_key'], 'contacts_ws_active_phone_unique');
        });
    }

    public function down(): void
    {
        Schema::table('contacts', function (Blueprint $table) {
            $table->dropUnique('contacts_ws_active_phone_unique');
            $table->dropColumn('active_phone_key');
        });
    }

    private function mergePhoneDuplicates(int $workspaceId, ContactDeduplicator $deduplicator): void
    {
        $deduplicator->mergeDuplicates($workspaceId, false);
    }

    /**
     * Removes the double-thread/double-contact effect of rows created with an
     * @lid wa_jid and a fabricated phone number.
     */
    private function healLidPoisonedRows(int $workspaceId, ContactDeduplicator $deduplicator): void
    {
        $poisoned = DB::table('whatsapp_contacts')
            ->where('workspace_id', $workspaceId)
            ->where('wa_jid', 'like', '%@lid')
            ->whereNotNull('phone_number')
            ->get(['id', 'wa_jid', 'phone_number', 'contact_id']);

        foreach ($poisoned as $row) {
            $lidJid = $row->wa_jid;

            // Locate the canonical phone-number row that carries this alias
            // (lid_jid = X@lid AND wa_jid != X@lid). Not found => the real
            // number has not been shared yet; just strip the fake phone so the
            // AutoLinker can't fabricate a contact from it.
            $canonical = DB::table('whatsapp_contacts')
                ->where('workspace_id', $workspaceId)
                ->where('lid_jid', $lidJid)
                ->where('wa_jid', '!=', $lidJid)
                ->first(['id', 'phone_number', 'contact_id']);

            if (! $canonical) {
                DB::table('whatsapp_contacts')
                    ->where('id', $row->id)
                    ->update(['phone_number' => null, 'lid_jid' => null]);

                continue;
            }

            // Fold the fabricated contact into the real one before any
            // conversation re-keying, so every record that referenced the fake
            // contact re-points to the real one.
            if ($row->contact_id && $canonical->contact_id && $row->contact_id !== $canonical->contact_id) {
                $deduplicator->mergeContacts((int) $canonical->contact_id, (int) $row->contact_id);
            } elseif ($row->contact_id && ! $canonical->contact_id) {
                // No real contact yet: adopt the fabricated one onto the real
                // number - unless a manually-saved contact already owns it.
                $normalized = $canonical->phone_number
                    ? \App\Support\PhoneNumber::normalize($canonical->phone_number)
                    : null;
                $existing = $normalized
                    ? Contact::query()
                        ->where('workspace_id', $workspaceId)
                        ->where('normalized_phone_number', $normalized)
                        ->whereKeyNot($row->contact_id)
                        ->orderBy('id')
                        ->first()
                    : null;

                if ($existing) {
                    $deduplicator->mergeContacts((int) $existing->id, (int) $row->contact_id);
                } else {
                    // Its phone was fake LID digits, so repair them.
                    DB::table('contacts')
                        ->where('id', $row->contact_id)
                        ->update(['phone_number' => $canonical->phone_number, 'whatsapp_contact_id' => $canonical->id]);
                    DB::table('whatsapp_contacts')
                        ->where('id', $canonical->id)
                        ->update(['contact_id' => $row->contact_id]);
                }
            }

            $this->foldConversation($workspaceId, $row->id, $canonical->id, $canonical->contact_id);

            // The poisoned row is now an empty shell (no conversation, no
            // phone, no contact link) - drop it.
            DB::table('whatsapp_contacts')->where('id', $row->id)->delete();
        }
    }

    /**
     * Moves the poisoned row's conversation onto the canonical row - folding
     * messages when a thread already exists there (mirrors the gateway's
     * setLidJid re-key in whatsapp-gateway).
     */
    private function foldConversation(int $workspaceId, int $sourceWcId, int $targetWcId, ?int $targetContactId): void
    {
        $source = DB::table('conversations')
            ->where('workspace_id', $workspaceId)
            ->where('whatsapp_contact_id', $sourceWcId)
            ->first();

        if (! $source) {
            return;
        }

        $target = DB::table('conversations')
            ->where('workspace_id', $workspaceId)
            ->where('whatsapp_contact_id', $targetWcId)
            ->first();

        if (! $target) {
            DB::table('conversations')
                ->where('id', $source->id)
                ->update([
                    'whatsapp_contact_id' => $targetWcId,
                    'contact_id' => $targetContactId ?? $source->contact_id,
                ]);

            return;
        }

        DB::table('messages')->where('conversation_id', $source->id)->update(['conversation_id' => $target->id]);
        DB::table('conversations')->where('id', $target->id)->update([
            'last_message_at' => DB::raw("GREATEST(COALESCE(last_message_at, '1970-01-01'), COALESCE((SELECT MAX(sent_at) FROM messages WHERE conversation_id = {$target->id}), last_message_at))"),
            'last_message_preview' => DB::raw("COALESCE((SELECT body FROM messages WHERE conversation_id = {$target->id} ORDER BY sent_at DESC LIMIT 1), last_message_preview)"),
            'unread_count' => DB::raw("unread_count + (SELECT COUNT(*) FROM messages WHERE conversation_id = {$target->id} AND direction = 'inbound' AND status = 'sent')"),
        ]);
        DB::table('conversations')->where('id', $source->id)->delete();
    }
};