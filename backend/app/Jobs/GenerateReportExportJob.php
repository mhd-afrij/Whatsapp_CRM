<?php

namespace App\Jobs;

use App\Models\Contact;
use App\Models\Deal;
use App\Models\Lead;
use App\Models\Task;
use App\Models\User;
use App\Services\NotificationService;
use Carbon\Carbon;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Queued CSV export for /api/v1/reports/export (Phase 13/analytics). Spec calls for
 * "background generation" + a completion notification, so this always dispatches through
 * the queue (never runs synchronously in the controller) even though QUEUE_CONNECTION=sync
 * in local/test environments makes it execute inline - the structure is queue-ready for a
 * real worker in staging/production (QUEUE_CONNECTION=redis, see config/queue.php).
 *
 * Writes to the `local` disk under `exports/{workspace_id}/...csv` (not `public` - exports
 * may contain PII like contact phone numbers/emails, so they are downloaded through an
 * authenticated, workspace-scoped controller action rather than a public URL).
 */
class GenerateReportExportJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(
        public readonly int $workspaceId,
        public readonly int $userId,
        public readonly string $type,
        public readonly ?string $from,
        public readonly ?string $to,
    ) {
    }

    public function handle(): void
    {
        $user = User::query()->find($this->userId);
        if (! $user) {
            return;
        }

        [$rows, $headers] = $this->rowsFor($this->type);

        $filename = 'exports/'.$this->workspaceId.'/'.$this->type.'-'.now()->format('YmdHis').'-'.Str::random(8).'.csv';

        $csv = $this->toCsv($headers, $rows);
        Storage::disk('local')->put($filename, $csv);

        NotificationService::notify($user, 'report.export_ready', [
            'type' => $this->type,
            'file' => $filename,
            'row_count' => count($rows),
        ]);
    }

    /**
     * @return array{0: array<int, array<string, mixed>>, 1: array<int, string>}
     */
    private function rowsFor(string $type): array
    {
        $from = $this->from ? Carbon::parse($this->from)->startOfDay() : now()->subDays(29)->startOfDay();
        $to = $this->to ? Carbon::parse($this->to)->endOfDay() : now()->endOfDay();

        return match ($type) {
            'contacts' => [
                Contact::query()->where('workspace_id', $this->workspaceId)
                    ->whereBetween('created_at', [$from, $to])
                    ->get(['id', 'full_name', 'email', 'phone_number', 'created_at'])
                    ->map(fn ($c) => [
                        'id' => $c->id, 'full_name' => $c->full_name, 'email' => $c->email,
                        'phone_number' => $c->phone_number, 'created_at' => $c->created_at,
                    ])->all(),
                ['id', 'full_name', 'email', 'phone_number', 'created_at'],
            ],
            'leads' => [
                Lead::query()->where('workspace_id', $this->workspaceId)
                    ->whereBetween('created_at', [$from, $to])
                    ->get(['id', 'contact_id', 'source', 'status', 'owner_user_id', 'created_at'])
                    ->map(fn ($l) => [
                        'id' => $l->id, 'contact_id' => $l->contact_id, 'source' => $l->source,
                        'status' => $l->status, 'owner_user_id' => $l->owner_user_id, 'created_at' => $l->created_at,
                    ])->all(),
                ['id', 'contact_id', 'source', 'status', 'owner_user_id', 'created_at'],
            ],
            'deals' => [
                Deal::query()->where('workspace_id', $this->workspaceId)
                    ->whereBetween('created_at', [$from, $to])
                    ->get(['id', 'title', 'value_amount', 'status', 'owner_user_id', 'closed_at', 'created_at'])
                    ->map(fn ($d) => [
                        'id' => $d->id, 'title' => $d->title, 'value_amount' => $d->value_amount,
                        'status' => $d->status, 'owner_user_id' => $d->owner_user_id,
                        'closed_at' => $d->closed_at, 'created_at' => $d->created_at,
                    ])->all(),
                ['id', 'title', 'value_amount', 'status', 'owner_user_id', 'closed_at', 'created_at'],
            ],
            'tasks' => [
                Task::query()->where('workspace_id', $this->workspaceId)
                    ->whereBetween('created_at', [$from, $to])
                    ->get(['id', 'title', 'status', 'priority', 'assignee_id', 'due_at', 'completed_at'])
                    ->map(fn ($t) => [
                        'id' => $t->id, 'title' => $t->title, 'status' => $t->status,
                        'priority' => $t->priority, 'assignee_id' => $t->assignee_id,
                        'due_at' => $t->due_at, 'completed_at' => $t->completed_at,
                    ])->all(),
                ['id', 'title', 'status', 'priority', 'assignee_id', 'due_at', 'completed_at'],
            ],
            default => [[], []],
        };
    }

    private function toCsv(array $headers, array $rows): string
    {
        $fh = fopen('php://temp', 'r+');
        fputcsv($fh, $headers);
        foreach ($rows as $row) {
            fputcsv($fh, array_map(fn ($v) => $v instanceof Carbon ? $v->toIso8601String() : $v, $row));
        }
        rewind($fh);
        $content = stream_get_contents($fh);
        fclose($fh);

        return $content;
    }
}
