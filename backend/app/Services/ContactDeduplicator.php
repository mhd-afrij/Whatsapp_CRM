<?php

namespace App\Services;

use App\Models\Contact;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Merges duplicate CRM contacts - same (workspace_id, normalized_phone_number)
 * - that were left behind before phone-based dedup was enforced on the
 * WhatsApp path (e.g. the old inbound handler that fabricated a contact from
 * a WhatsApp push name without first matching the existing number).
 *
 * One row per group survives; every linked record (whatsapp_contacts,
 * conversations, deals, tasks, leads, campaigns, notes, activities, labels)
 * is re-pointed to it and the victims are hard-deleted. The survivor is chosen
 * as: a non-WhatsApp-origin row first (a manually saved "Mr Blvck" beats an
 * auto-created "MOHAMED BATH..."), then the earliest created, then the lowest
 * id. Missing CRM fields on the survivor are enriched from the victims.
 *
 * Run via `php artisan contacts:merge-duplicates` (use --dry-run to preview).
 */
class ContactDeduplicator
{
    /**
     * @return array{groups: int, merged: int, deleted: int, details: array<int, array<string, mixed>>}
     */
    public function mergeDuplicates(?int $workspaceId = null, bool $dryRun = false): array
    {
        $groups = DB::table('contacts')
            ->selectRaw('workspace_id, normalized_phone_number, COUNT(*) as cnt')
            ->whereNotNull('normalized_phone_number')
            ->whereNull('deleted_at')
            ->when($workspaceId !== null, fn ($q) => $q->where('workspace_id', $workspaceId))
            ->groupBy('workspace_id', 'normalized_phone_number')
            ->havingRaw('COUNT(*) > 1')
            ->get();

        $report = ['groups' => $groups->count(), 'merged' => 0, 'deleted' => 0, 'details' => []];

        foreach ($groups as $group) {
            $duplicates = Contact::where('workspace_id', $group->workspace_id)
                ->where('normalized_phone_number', $group->normalized_phone_number)
                ->orderByRaw("CASE WHEN source <> 'whatsapp' THEN 0 ELSE 1 END")
                ->orderBy('created_at')
                ->orderBy('id')
                ->get();

            if ($duplicates->count() < 2) {
                continue;
            }

            $survivor = $duplicates->shift();
            $mergedIds = $duplicates->pluck('id')->all();

            $detail = [
                'workspace_id' => $survivor->workspace_id,
                'phone' => $survivor->normalized_phone_number,
                'kept' => $survivor->id,
                'kept_name' => $survivor->full_name,
                'merged' => $mergedIds,
            ];

            if (! $dryRun) {
                foreach ($duplicates as $victim) {
                    $this->mergeInto($survivor, $victim);
                }
                $report['merged']++;
                $report['deleted'] += count($mergedIds);
            }

            $report['details'][] = $detail;
        }

        return $report;
    }

    /**
     * Merges one specific victim contact into one specific survivor, re-pointing
     * every linked record, folding labels, enriching missing fields, then
     * hard-deleting the victim. Used by the duplicate-cleanup migration for
     * pairs the phone-based grouping can't see (e.g. a contact fabricated from
     * a poisoned @lid phone number). Both rows must belong to the same
     * workspace; a catch-all guard falls back to re-selecting by id otherwise.
     */
    public function mergeContacts(int $survivorId, int $victimId, bool $dryRun = false): bool
    {
        if ($survivorId === $victimId) {
            return false;
        }

        $survivor = Contact::withTrashed()->find($survivorId);
        $victim = Contact::withTrashed()->find($victimId);

        if (! $survivor || ! $victim) {
            return false;
        }

        if ($survivor->workspace_id !== $victim->workspace_id) {
            return false;
        }

        if ($dryRun) {
            return true;
        }

        $this->mergeInto($survivor, $victim);

        return true;
    }

    /**
     * Re-points every record that references the victim onto the survivor,
     * copies missing CRM fields over, then hard-deletes the victim.
     */
    protected function mergeInto(Contact $survivor, Contact $victim): void
    {
        DB::transaction(function () use ($survivor, $victim) {
            $this->enrichSurvivor($survivor, $victim);

            $mappings = [
                'whatsapp_contacts' => 'contact_id',
                'conversations' => 'contact_id',
                'deals' => 'contact_id',
                'tasks' => 'contact_id',
                'internal_notes' => 'contact_id',
                'contact_activities' => 'contact_id',
                'leads' => 'contact_id',
            ];

            foreach ($mappings as $table => $column) {
                DB::table($table)->where($column, $victim->id)->update([$column => $survivor->id]);
            }

            // Spec §3/§6: one contact must own exactly ONE conversation. After
            // re-pointing, the survivor can hold both threads of a merged pair -
            // fold them so no duplicate conversation survives the merge.
            $this->foldConversations((int) $survivor->id);

            // contact_label is keyed on (label_id, contact_id) - fold the
            // victim's labels into the survivor, skipping pairs it already has.
            foreach (DB::table('contact_label')->where('contact_id', $victim->id)->get() as $row) {
                DB::table('contact_label')->updateOrInsert(
                    ['label_id' => $row->label_id, 'contact_id' => $survivor->id],
                    ['created_at' => $row->created_at],
                );
            }
            DB::table('contact_label')->where('contact_id', $victim->id)->delete();

            // campaign_messages is keyed on (campaign_id, contact_id) and its
            // contact FK cascades on delete - fold the victim's per-campaign
            // dispatch rows into the survivor before the victim is removed.
            foreach (DB::table('campaign_messages')->where('contact_id', $victim->id)->get() as $row) {
                DB::table('campaign_messages')->updateOrInsert(
                    ['campaign_id' => $row->campaign_id, 'contact_id' => $survivor->id],
                    [
                        'phone_number' => $row->phone_number,
                        'rendered_content' => $row->rendered_content,
                        'status' => $row->status,
                        'conversation_id' => $row->conversation_id,
                        'wa_message_id' => $row->wa_message_id,
                        'dispatch_id' => $row->dispatch_id,
                        'error' => $row->error,
                        'sent_at' => $row->sent_at,
                        'updated_at' => $row->updated_at ?? now(),
                    ],
                );
            }
            DB::table('campaign_messages')->where('contact_id', $victim->id)->delete();

            $victim->forceDelete();
        });
    }

    /**
     * Folds every conversation a contact owns down to a single survivor
     * (spec §3/§6: same phone number = one active conversation). Keeps the
     * fittest row - an open/pending thread first, then the most recently
     * active - moves the other rows' messages and conversation-scoped
     * references onto it, and hard-deletes them (assignments/participants/
     * reactions cascade with the row). Mirrors the gateway's setLidJid
     * conversation merge (whatsapp-gateway/src/whatsapp/message-repository.ts).
     */
    protected function foldConversations(int $contactId): void
    {
        $conversations = DB::table('conversations')
            ->where('contact_id', $contactId)
            ->orderByRaw("CASE WHEN status IN ('open', 'pending') THEN 0 ELSE 1 END")
            ->orderByRaw('COALESCE(last_message_at, created_at) DESC')
            ->orderBy('id')
            ->get();

        if ($conversations->count() < 2) {
            return;
        }

        $keeper = $conversations->shift();

        // Conversation-scoped references that would otherwise be nulled or
        // cascade-deleted follow the messages onto the keeper.
        $referenceTables = [
            'leads', 'tasks', 'internal_notes', 'campaign_messages',
            'message_processing_failures', 'message_dispatch_queue', 'sla_events',
        ];

        foreach ($conversations as $duplicate) {
            foreach ($referenceTables as $table) {
                if (Schema::hasTable($table) && Schema::hasColumn($table, 'conversation_id')) {
                    DB::table($table)
                        ->where('conversation_id', $duplicate->id)
                        ->update(['conversation_id' => $keeper->id]);
                }
            }

            if (Schema::hasTable('conversation_label')) {
                foreach (DB::table('conversation_label')->where('conversation_id', $duplicate->id)->get() as $row) {
                    DB::table('conversation_label')->updateOrInsert(
                        ['label_id' => $row->label_id, 'conversation_id' => $keeper->id],
                        ['created_at' => $row->created_at],
                    );
                }
                DB::table('conversation_label')->where('conversation_id', $duplicate->id)->delete();
            }

            $duplicateUnread = max((int) ($duplicate->unread_count ?? 0), 0);

            DB::table('messages')
                ->where('conversation_id', $duplicate->id)
                ->update(['conversation_id' => $keeper->id]);

            DB::table('conversations')->where('id', $keeper->id)->update([
                'last_message_at' => DB::raw("GREATEST(COALESCE(last_message_at, '1970-01-01'), COALESCE((SELECT MAX(sent_at) FROM messages WHERE conversation_id = {$keeper->id}), last_message_at))"),
                'last_message_preview' => DB::raw("COALESCE((SELECT body FROM messages WHERE conversation_id = {$keeper->id} ORDER BY sent_at DESC LIMIT 1), last_message_preview)"),
                'unread_count' => DB::raw('unread_count + '.$duplicateUnread),
                'updated_at' => now(),
            ]);

            DB::table('conversations')->where('id', $duplicate->id)->delete();
        }
    }

    /**
     * Copies CRM fields the survivor is missing from the victim (name, email,
     * company, job title, address details, custom fields) so merging loses as
     * little data as possible.
     */
    protected function enrichSurvivor(Contact $survivor, Contact $victim): void
    {
        $fills = [];
        $copyable = [
            'full_name', 'email', 'company', 'job_title', 'phone_number',
            'address', 'city', 'country', 'timezone', 'custom_fields',
        ];

        foreach ($copyable as $field) {
            if (blank($survivor->{$field}) && ! blank($victim->{$field})) {
                $fills[$field] = $victim->{$field};
            }
        }

        if ($fills !== []) {
            $survivor->update($fills);
        }
    }
}
