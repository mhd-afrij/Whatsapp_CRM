<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;

/**
 * DLQ (Dead Letter Queue) management for the failed_jobs table. Routed under
 * `permission:dlq.manage` (Super Admin + Administrator, see
 * docs/07-permission-matrix.md and routes/api.php).
 *
 * Security model:
 * - Workspace isolation: a tenant admin may only see and act on failed jobs
 *   attributable to their own workspace. Jobs are matched via the serialized
 *   job command (GenerateReportExportJob carries workspaceId; the campaign job
 *   is resolved through its campaign_messages row). Jobs whose workspace
 *   cannot be determined are never listed, retried or deleted - they belong to
 *   the platform layer, not to a tenant admin.
 * - Minimal leakage: raw serialized payloads (which embed the full command +
 *   PII-carrying model properties) and full exception stack traces are never
 *   sent to the browser. The index returns only the display name, command
 *   name and a truncated exception preview.
 */
class FailedJobController extends Controller
{
    /**
     * GET /api/v1/failed-jobs
     * List the caller's own workspace's failed jobs with pagination.
     */
    public function index(Request $request)
    {
        $workspaceId = $request->user()->workspace_id;
        $perPage = min(max((int) $request->integer('per_page', 20), 1), 100);
        $page = max((int) $request->integer('page', 1), 1);

        $rows = DB::table('failed_jobs')
            ->select('id', 'connection', 'queue', 'payload', 'exception', 'failed_at')
            ->orderByDesc('failed_at')
            ->get();

        $mine = $rows->filter(fn ($job) => $this->workspaceIdForJob($job) === $workspaceId);

        $total = $mine->count();
        $lastPage = (int) max(ceil($total / $perPage), 1);

        $items = $mine
            ->slice(($page - 1) * $perPage, $perPage)
            ->values()
            ->map(function ($job) {
                $payload = (array) json_decode($job->payload, true);

                return [
                    'id' => $job->id,
                    'connection' => $job->connection,
                    'queue' => $job->queue,
                    'job_class' => $payload['displayName'] ?? data_get($payload, 'job', 'Unknown Job'),
                    'command_name' => data_get($payload, 'data.commandName'),
                    'exception_preview' => $job->exception !== null
                        ? mb_substr($job->exception, 0, 2000)
                        : null,
                    'failed_at' => $job->failed_at,
                ];
            });

        return $this->success([
            'items' => $items,
        ], 'OK', [
            'page' => $page,
            'per_page' => $perPage,
            'total' => $total,
            'last_page' => $lastPage,
        ]);
    }

    /**
     * POST /api/v1/failed-jobs/{id}/retry
     * Retry a single failed job from the caller's own workspace.
     */
    public function retry(Request $request, int $id)
    {
        $job = DB::table('failed_jobs')->where('id', $id)->first();

        if (! $job) {
            return $this->error('Failed job not found.', null, 404);
        }

        if ($this->workspaceIdForJob($job) !== $request->user()->workspace_id) {
            // Do not reveal the existence of another workspace's job.
            return $this->error('Failed job not found.', null, 404);
        }

        Queue::connection($job->connection)
            ->pushRaw($job->payload, $job->queue, []);

        DB::table('failed_jobs')->where('id', $id)->delete();

        return $this->success(null, 'Job re-dispatched successfully.');
    }

    /**
     * POST /api/v1/failed-jobs/retry-all
     * Retry all of the caller's own workspace's failed jobs.
     */
    public function retryAll(Request $request)
    {
        $workspaceId = $request->user()->workspace_id;

        $jobs = DB::table('failed_jobs')->get();
        $count = 0;

        foreach ($jobs as $job) {
            if ($this->workspaceIdForJob($job) !== $workspaceId) {
                continue;
            }

            try {
                Queue::connection($job->connection)
                    ->pushRaw($job->payload, $job->queue, []);
                DB::table('failed_jobs')->where('id', $job->id)->delete();
                $count++;
            } catch (\Throwable $e) {
                // Skip jobs that fail to re-dispatch
                continue;
            }
        }

        return $this->success(null, "{$count} jobs re-dispatched.");
    }

    /**
     * DELETE /api/v1/failed-jobs/{id}
     * Delete a single failed job from the caller's own workspace.
     */
    public function destroy(Request $request, int $id)
    {
        $job = DB::table('failed_jobs')->where('id', $id)->first();

        if (! $job) {
            return $this->error('Failed job not found.', null, 404);
        }

        if ($this->workspaceIdForJob($job) !== $request->user()->workspace_id) {
            return $this->error('Failed job not found.', null, 404);
        }

        DB::table('failed_jobs')->where('id', $id)->delete();

        return $this->success(null, 'Failed job deleted.');
    }

    /**
     * Resolve the owning workspace of a failed job record from its serialized
     * command. Returns null for jobs that carry no tenant attribution (e.g.
     * framework/system jobs) - callers treat those as out of scope.
     */
    private function workspaceIdForJob(object $job): ?int
    {
        $payload = json_decode($job->payload, true);
        if (! is_array($payload)) {
            return null;
        }

        $command = $payload['data']['command'] ?? null;
        if (! is_string($command) || $command === '') {
            return null;
        }

        $instance = unserialize($command, ['allowed_classes' => true]);
        if ($instance instanceof \App\Jobs\GenerateReportExportJob) {
            return $instance->workspaceId;
        }

        if ($instance instanceof \App\Jobs\SendCampaignMessageJob) {
            $workspaceId = DB::table('campaign_messages')
                ->where('id', $instance->campaignMessageId)
                ->value('workspace_id');

            return $workspaceId !== null ? (int) $workspaceId : null;
        }

        return null;
    }
}