<?php

namespace App\Console\Commands;

use App\Services\ContactDeduplicator;
use Illuminate\Console\Command;

class MergeDuplicateContacts extends Command
{
    protected $signature = 'contacts:merge-duplicates
                            {--workspace= : Only merge duplicates in this workspace id}
                            {--dry-run : Report what would be merged without changing anything}';

    protected $description = 'Merge CRM contacts that share the same normalized phone number (keeps one, re-points everything, deletes the rest)';

    public function handle(ContactDeduplicator $deduplicator): int
    {
        $workspaceId = $this->option('workspace') !== null
            ? (int) $this->option('workspace')
            : null;

        $report = $deduplicator->mergeDuplicates($workspaceId, (bool) $this->option('dry-run'));

        if ($report['groups'] === 0) {
            $this->info('No duplicate contact groups found.');

            return self::SUCCESS;
        }

        foreach ($report['details'] as $detail) {
            $this->line(sprintf(
                'WS %d  %s: kept contact #%d (%s) <- merged %s',
                $detail['workspace_id'],
                $detail['phone'],
                $detail['kept'],
                $detail['kept_name'] ?: '(no name)',
                implode(', ', array_map(fn ($id) => '#'.$id, $detail['merged'])),
            ));
        }

        if ($this->option('dry-run')) {
            $this->info(sprintf(
                'Dry run: %d group(s) found, %d contact(s) would be merged and deleted.',
                $report['groups'],
                $report['deleted'],
            ));

            return self::SUCCESS;
        }

        $this->info(sprintf(
            'Merged %d group(s): %d duplicate contact(s) deleted.',
            $report['merged'],
            $report['deleted'],
        ));

        return self::SUCCESS;
    }
}
