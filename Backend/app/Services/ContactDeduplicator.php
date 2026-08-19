<?php

namespace App\Services;

use App\Models\Contact;
use Illuminate\Support\Facades\DB;

/**
 * Merges duplicate CRM contacts - same (workspace_id, normalized_phone_number)
 * - that were left behind before phone-based dedup was enforced on the
 * WhatsApp path (e.g. the old inbound handler that fabricated a contact from
 * a WhatsApp push name without first matching the existing number).
 *
 * One row per group survives; every linked record (whatsapp_contacts,
 * conversations, leads, deals, tasks, notes, activities, labels) is re-pointed
 * to it and the victims are hard-deleted. The survivor is chosen as: a
 * non-WhatsApp-origin row first (a manually saved "Mr Blvck" beats an
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
                'leads' => 'contact_id',
                'deals' => 'contact_id',
                'tasks' => 'contact_id',
                'internal_notes' => 'contact_id',
                'contact_activities' => 'contact_id',
            ];

            foreach ($mappings as $table => $column) {
                DB::table($table)->where($column, $victim->id)->update([$column => $survivor->id]);
            }

            // contact_label is keyed on (label_id, contact_id) - fold the
            // victim's labels into the survivor, skipping pairs it already has.
            foreach (DB::table('contact_label')->where('contact_id', $victim->id)->get() as $row) {
                DB::table('contact_label')->updateOrInsert(
                    ['label_id' => $row->label_id, 'contact_id' => $survivor->id],
                    ['created_at' => $row->created_at],
                );
            }
            DB::table('contact_label')->where('contact_id', $victim->id)->delete();

            $victim->forceDelete();
        });
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
