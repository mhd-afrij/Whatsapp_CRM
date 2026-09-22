<?php

namespace App\Jobs;

use App\Models\Contact;
use App\Models\Deal;
use App\Models\ReportExport;
use App\Models\Task;
use App\Models\User;
use App\Services\AzureBlobService;
use App\Services\NotificationService;
use App\Services\ReportService;
use Carbon\Carbon;
use Dompdf\Dompdf;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Str;
use Throwable;

/**
 * Queued export job for the Reports module.
 *
 * Legacy flow (no report_export record): dispatched by ReportExportController::store,
 * the result lives only in the notification bell. v2 flow: dispatched with a
 * $reportExportId, so the job updates the report_exports record (queued -> processing ->
 * ready/failed) alongside the notification.
 *
 * Types:
 *  - contacts / deals / tasks: simple CSV dumps of workspace rows in range (legacy).
 *  - daily_metrics / agent_summary: CSV built from the ReportService snapshot of the
 *    selected period (claim-aware).
 *  - full_pdf: a real PDF (dompdf) rendering the same snapshot.
 *
 * Writes to private storage (AzureBlobService, local disk) under
 * `exports/{workspace_id}/...` - exports may contain PII, so they are downloaded
 * through authenticated, user+workspace-scoped controller actions, never public URLs.
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
        public readonly ?int $reportExportId = null,
    ) {}

    public function handle(AzureBlobService $azureBlob, ReportService $reportService): void
    {
        $user = User::query()->find($this->userId);
        if (! $user) {
            return;
        }

        $export = $this->reportExportId ? ReportExport::query()->find($this->reportExportId) : null;
        if ($export) {
            $export->update(['status' => ReportExport::STATUS_PROCESSING]);
        }

        try {
            $reportData = $reportService->exportData($user, [
                'range' => 'custom',
                'from' => $this->from,
                'to' => $this->to,
            ]);

            [$mime, $extension, $headers, $rows] = $this->build($user, $reportData);

            $filename = 'exports/'.$this->workspaceId.'/'.'crm-report-'.$this->from.'-to-'.$this->to.'-'.$this->type.'-'.Str::random(8).'.'.$extension;
            $payload = $extension === 'pdf'
                ? $this->renderPdf($reportData, $headers, $rows)
                : $this->toCsv($headers, $rows);

            $upload = $azureBlob->uploadContent($payload, $filename, $mime);

            if ($export) {
                $export->update([
                    'status' => ReportExport::STATUS_READY,
                    'file_path' => $upload['file_path'],
                    'file_name' => basename($filename),
                    'mime_type' => $mime,
                    'row_count' => count($rows),
                    'completed_at' => now(),
                    'error_message' => null,
                ]);
            }

            NotificationService::notify($user, 'report.export_ready', [
                'type' => $this->type,
                'file' => $upload['file_path'],
                'file_url' => $upload['file_url'],
                'storage_provider' => $upload['storage_provider'],
                'row_count' => count($rows),
                'report_export_id' => $export?->id,
            ]);
        } catch (Throwable $e) {
            if ($export) {
                $export->update([
                    'status' => ReportExport::STATUS_FAILED,
                    'error_message' => Str::limit($e->getMessage(), 500),
                ]);
            }

            throw $e;
        }
    }

    /**
     * @return array{0: string, 1: string, 2: array<int, string>, 3: array<int, array<string, mixed>>}
     */
    private function build(User $user, array $reportData): array
    {
        return match ($this->type) {
            'daily_metrics' => ['text/csv', 'csv', $this->dailyHeaders(), $this->dailyRows($reportData)],
            'agent_summary' => ['text/csv', 'csv', $this->agentHeaders(), $this->agentRows($reportData)],
            'full_pdf' => ['application/pdf', 'pdf', [], $this->pdfRows($reportData)],
            default => $this->legacyRows($user),
        };
    }

    // ── New report types (built from the ReportService snapshot) ────────────

    /**
     * @return array<int, string>
     */
    private function dailyHeaders(): array
    {
        return ['Date', 'New conversations', 'New leads', 'Leads converted', 'Avg response (min)', 'Deals won', 'Won value', 'Deals lost', 'Lost value'];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function dailyRows(array $reportData): array
    {
        return array_map(fn ($row) => [
            'date' => $row['date'],
            'conversations' => $row['conversations'],
            'leads_created' => $row['leads'],
            'leads_converted' => $row['converted'],
            'avg_response_minutes' => $row['avg_response_minutes'] ?? '',
            'won_count' => $row['won_count'],
            'won_value' => $row['won_value'],
            'lost_count' => $row['lost_count'],
            'lost_value' => $row['lost_value'],
        ], $reportData['daily_series']);
    }

    /**
     * @return array<int, string>
     */
    private function agentHeaders(): array
    {
        return ['Rank', 'Agent', 'Conversations', 'Tasks completed', 'Deals won', 'Won value', 'Avg response (min)'];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function agentRows(array $reportData): array
    {
        return collect(array_values($reportData['leaderboard']))
            ->map(function ($agent, $index) {
                return [
                    'rank' => $index + 1,
                    'agent' => $agent['name'],
                    'conversations' => $agent['conversations'],
                    'tasks_completed' => $agent['tasks'],
                    'deals_won' => $agent['deals_won'],
                    'won_value' => $agent['won_value'],
                    'avg_response_minutes' => $agent['avg_response_minutes'] ?? '',
                ];
            })
            ->all();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function pdfRows(array $reportData): array
    {
        return ['overview' => $reportData];
    }

    private function renderPdf(array $reportData, array $headers, array $rows): string
    {
        $html = $this->pdfHtml($reportData);

        $dompdf = new Dompdf(['isRemoteEnabled' => false]);
        $dompdf->loadHtml($html, 'UTF-8');
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->render();

        return $dompdf->output();
    }

    private function pdfHtml(array $data): string
    {
        $period = $data['period']['from'].' to '.$data['period']['to'];
        $currency = $data['settings']['currency'] ?? '';

        $money = function ($value) use ($currency) {
            return number_format((float) ($value ?? 0)).' '.$currency;
        };

        $metrics = $data['metrics'];
        $rows = '';

        $metricRow = fn (string $label, ?string $current, $previous = '') => '<tr><td class="m">'.$label.'</td><td class="r">'.($current ?? '--').'</td><td class="r">'.($previous ?? '--').'</td></tr>';

        $rows .= $metricRow('New conversations', number_format((float) ($metrics['conversations']['value'] ?? 0)), ($metrics['conversations']['previous'] ?? null) !== null ? number_format((float) $metrics['conversations']['previous']) : null);
        $rows .= $metricRow('New leads', number_format((float) ($metrics['leads_created']['value'] ?? 0)), ($metrics['leads_created']['previous'] ?? null) !== null ? number_format((float) $metrics['leads_created']['previous']) : null);
        $rows .= $metricRow('Leads converted', number_format((float) ($metrics['leads_converted']['value'] ?? 0)), ($metrics['leads_converted']['previous'] ?? null) !== null ? number_format((float) $metrics['leads_converted']['previous']) : null);
        $rows .= $metricRow('Lead conversion rate', isset($metrics['lead_conversion_rate']['value']) ? round($metrics['lead_conversion_rate']['value'], 1).'%' : '--', isset($metrics['lead_conversion_rate']['previous']) ? round($metrics['lead_conversion_rate']['previous'], 1).'%' : null);
        $rows .= $metricRow('Won value', $money($metrics['won_value']['value']), $money($metrics['won_value']['previous']));
        $rows .= $metricRow('Lost value', $money($metrics['lost_value']['value']), $money($metrics['lost_value']['previous']));
        $rows .= $metricRow('Win rate', isset($metrics['win_rate']['value']) ? round($metrics['win_rate']['value'], 1).'%' : '--', isset($metrics['win_rate']['previous']) ? round($metrics['win_rate']['previous'], 1).'%' : null);
        $rows .= $metricRow('Avg response (min)', $metrics['avg_response_minutes']['value'] !== null ? round($metrics['avg_response_minutes']['value'], 1) : '--', $metrics['avg_response_minutes']['previous'] !== null ? round($metrics['avg_response_minutes']['previous'], 1) : null);
        $rows .= $metricRow('Task completion', isset($metrics['task_completion_rate']['value']) ? round($metrics['task_completion_rate']['value'], 1).'%' : '--', isset($metrics['task_completion_rate']['previous']) ? round($metrics['task_completion_rate']['previous'], 1).'%' : null);

        // Daily table (last 14 days) + lead distribution + top 5 agents.
        $daily = array_slice(array_reverse($data['daily_series']), 0, 14);
        $dailyRows = '';
        foreach ($daily as $row) {
            $dailyRows .= '<tr><td>'.$row['date'].'</td><td class="r">'.$row['conversations'].'</td><td class="r">'.$row['leads'].'</td><td class="r">'.$row['converted'].'</td><td class="r">'.($row['avg_response_minutes'] !== null ? round($row['avg_response_minutes'], 1) : '--').'</td><td class="r">'.$row['won_count'].'</td><td class="r">'.number_format((float) $row['won_value']).'</td><td class="r">'.$row['lost_count'].'</td><td class="r">'.number_format((float) $row['lost_value']).'</td></tr>';
        }

        $leadRows = '';
        foreach ($data['leads']['current_by_status'] ?? [] as $status) {
            if (($status['count'] ?? 0) === 0) {
                continue;
            }
            $leadRows .= '<tr><td>'.e($status['name']).'</td><td class="r">'.$status['count'].'</td></tr>';
        }

        $agents = array_slice($data['leaderboard'], 0, 5);
        $agentRows = '';
        foreach ($agents as $i => $agent) {
            $agentRows .= '<tr><td>'.($i + 1).'</td><td>'.e($agent['name']).'</td><td class="r">'.$agent['conversations'].'</td><td class="r">'.$agent['tasks'].'</td><td class="r">'.$agent['deals_won'].'</td><td class="r">'.number_format((float) $agent['won_value']).'</td></tr>';
        }

        return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>
            body { font-family: sans-serif; font-size: 11px; color: #1b1b1b; }
            h1 { font-size: 18px; margin: 0 0 2px; }
            .sub { color: #667; margin-bottom: 14px; }
            h2 { font-size: 13px; margin: 18px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 3px; }
            table { width: 100%; border-collapse: collapse; }
            td, th { padding: 4px 6px; border-bottom: 1px solid #e5e5e5; }
            th { text-align: left; color: #667; font-size: 10px; text-transform: uppercase; }
            .r { text-align: right; }
            .m { font-weight: bold; }
            .tfoot td { font-size: 9px; color: #999; padding-top: 10px; border: 0; }
            </style></head><body>
            <h1>CRM Analytics Report</h1>
            <p class="sub">'.$period.' &middot; timezone '.e($data['period']['timezone']).' &middot; generated '.now()->format('Y-m-d H:i').'</p>
            <h2>Key metrics</h2>
            <table><tr><th>Metric</th><th class="r">Period</th><th class="r">Previous</th></tr>'.$rows.'</table>
            <h2>Daily breakdown (last 14 days)</h2>
            <table><tr><th>Date</th><th class="r">Chats</th><th class="r">Leads</th><th class="r">Conv.</th><th class="r">Avg resp</th><th class="r">Won</th><th class="r">Won value</th><th class="r">Lost</th><th class="r">Lost value</th></tr>'.$dailyRows.'</table>
            <h2>Lead distribution (current)</h2>
            <table><tr><th>Status</th><th class="r">Leads</th></tr>'.($leadRows !== '' ? $leadRows : '<tr><td colspan="2">No leads yet.</td></tr>').'</table>
            <h2>Agent leaderboard (top 5)</h2>
            <table><tr><th>#</th><th>Agent</th><th class="r">Conversations</th><th class="r">Tasks</th><th class="r">Deals won</th><th class="r">Won value</th></tr>'.$agentRows.'</table>
            <table><tr class="tfoot"><td>Generated by CRM Reports.</td></tr></table>
            </body></html>';
    }

    // ── Legacy types (contacts / deals / tasks) ─────────────────────────────

    /**
     * @return array{0: string, 1: string, 2: array<int, string>, 3: array<int, array<string, mixed>>}
     */
    private function legacyRows(User $user): array
    {
        $from = $this->from ? Carbon::parse($this->from)->startOfDay() : now()->subDays(29)->startOfDay();
        $to = $this->to ? Carbon::parse($this->to)->endOfDay() : now()->endOfDay();

        [$rows, $headers] = match ($this->type) {
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
        };

        return ['text/csv', 'csv', $headers, $rows];
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
