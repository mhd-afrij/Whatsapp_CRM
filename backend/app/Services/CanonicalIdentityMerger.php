<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class CanonicalIdentityMerger
{
    public function mergeDuplicateWhatsappContacts(): void
    {
        $groups = DB::table('whatsapp_contacts')
            ->selectRaw('workspace_id, phone_number, COUNT(*) as cnt')
            ->whereNotNull('phone_number')
            ->groupBy('workspace_id', 'phone_number')
            ->havingRaw('COUNT(*) > 1')
            ->get();

        foreach ($groups as $group) {
            $rows = DB::table('whatsapp_contacts')
                ->where('workspace_id', $group->workspace_id)
                ->where('phone_number', $group->phone_number)
                ->orderBy('id')
                ->get();

            $keeper = $rows->shift();
            if (! $keeper) {
                continue;
            }

            foreach ($rows as $dupe) {
                $fills = [];
                foreach (['push_name', 'contact_name', 'profile_picture_url', 'lid_jid'] as $field) {
                    if (empty($keeper->{$field}) && ! empty($dupe->{$field})) {
                        $fills[$field] = $dupe->{$field};
                    }
                }
                if ($keeper->contact_id === null && $dupe->contact_id !== null) {
                    $fills['contact_id'] = $dupe->contact_id;
                }
                if ($fills !== []) {
                    DB::table('whatsapp_contacts')->where('id', $keeper->id)->update($fills);
                    foreach ($fills as $field => $value) {
                        $keeper->{$field} = $value;
                    }
                }

                $this->mergeConversationPair((int) $group->workspace_id, (int) $dupe->id, (int) $keeper->id);

                DB::table('message_reactions')->where('whatsapp_contact_id', $dupe->id)->update(['whatsapp_contact_id' => $keeper->id]);
                DB::table('contacts')->where('whatsapp_contact_id', $dupe->id)->update(['whatsapp_contact_id' => $keeper->id]);
                DB::table('whatsapp_contacts')->where('id', $dupe->id)->delete();
            }
        }
    }

    public function mergeDuplicateConversations(): void
    {
        $groups = DB::table('conversations')
            ->selectRaw('workspace_id, whatsapp_contact_id, COALESCE(whatsapp_account_id, 0) as acct, COUNT(*) as cnt')
            ->groupBy('workspace_id', 'whatsapp_contact_id', DB::raw('COALESCE(whatsapp_account_id, 0)'))
            ->havingRaw('COUNT(*) > 1')
            ->get();

        foreach ($groups as $group) {
            $threads = DB::table('conversations')
                ->where('workspace_id', $group->workspace_id)
                ->where('whatsapp_contact_id', $group->whatsapp_contact_id)
                ->whereRaw('COALESCE(whatsapp_account_id, 0) = ?', [(int) $group->acct])
                ->orderByRaw('COALESCE(last_message_at, created_at) DESC')
                ->orderBy('id')
                ->get();

            $keeper = $threads->shift();
            if (! $keeper) {
                continue;
            }

            foreach ($threads as $dupe) {
                $this->foldConversationOnto((int) $dupe->id, (int) $keeper->id);
            }

            $this->refreshConversationAggregates((int) $keeper->id);
        }
    }

    private function mergeConversationPair(int $workspaceId, int $sourceWcId, int $targetWcId): void
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
            DB::table('conversations')->where('id', $source->id)->update([
                'whatsapp_contact_id' => $targetWcId,
                'contact_id' => DB::table('whatsapp_contacts')->where('id', $targetWcId)->value('contact_id') ?? $source->contact_id,
            ]);

            return;
        }

        if ((int) ($source->whatsapp_account_id ?? 0) !== (int) ($target->whatsapp_account_id ?? 0)) {
            DB::table('conversations')->where('id', $source->id)->update(['whatsapp_contact_id' => $targetWcId]);

            return;
        }

        $this->foldConversationOnto((int) $source->id, (int) $target->id);
        $this->refreshConversationAggregates((int) $target->id);
    }

    private function foldConversationOnto(int $duplicateId, int $keeperId): void
    {
        $tables = ['leads', 'tasks', 'internal_notes', 'campaign_messages', 'message_processing_failures', 'message_dispatch_queue', 'sla_events', 'conversation_assignments', 'conversation_participants'];

        foreach ($tables as $table) {
            if (Schema::hasTable($table) && Schema::hasColumn($table, 'conversation_id')) {
                DB::table($table)->where('conversation_id', $duplicateId)->update(['conversation_id' => $keeperId]);
            }
        }

        if (Schema::hasTable('conversation_label')) {
            foreach (DB::table('conversation_label')->where('conversation_id', $duplicateId)->get() as $row) {
                DB::table('conversation_label')->updateOrInsert(
                    ['label_id' => $row->label_id, 'conversation_id' => $keeperId],
                    ['created_at' => $row->created_at ?? now()]
                );
            }
            DB::table('conversation_label')->where('conversation_id', $duplicateId)->delete();
        }

        $dupeUnread = (int) (DB::table('conversations')->where('id', $duplicateId)->value('unread_count') ?? 0);
        DB::table('messages')->where('conversation_id', $duplicateId)->update(['conversation_id' => $keeperId]);
        DB::table('conversations')->where('id', $keeperId)->update([
            'unread_count' => DB::raw('unread_count + '.$dupeUnread),
            'updated_at' => now(),
        ]);
        DB::table('conversations')->where('id', $duplicateId)->delete();
    }

    private function refreshConversationAggregates(int $conversationId): void
    {
        DB::table('conversations')->where('id', $conversationId)->update([
            'last_message_at' => DB::raw("(SELECT MAX(sent_at) FROM messages WHERE conversation_id = {$conversationId})"),
            'last_message_preview' => DB::raw("(SELECT body FROM messages WHERE conversation_id = {$conversationId} ORDER BY sent_at DESC LIMIT 1)"),
            'updated_at' => now(),
        ]);
    }
}
