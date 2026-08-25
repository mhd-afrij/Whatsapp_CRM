<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;

class FailedJobController extends Controller
{
    /**
     * GET /api/v1/failed-jobs
     * List all failed jobs with pagination.
     */
    public function index(Request $request)
    {
        $perPage = min(max((int) $request->integer('per_page', 20), 1), 100);

        $query = DB::table('failed_jobs')
            ->select('id', 'connection', 'queue', 'payload', 'exception', 'failed_at')
            ->orderByDesc('failed_at');

        $paginator = $query->paginate($perPage);

        $items = collect($paginator->items())->map(function ($job) {
            $payload = json_decode($job->payload, true);
            $displayName = $payload['displayName'] ?? data_get($payload, 'job', 'Unknown Job');

            return [
                'id' => $job->id,
                'connection' => $job->connection,
                'queue' => $job->queue,
                'job_class' => $displayName,
                'payload' => $payload,
                'exception' => $job->exception,
                'failed_at' => $job->failed_at,
            ];
        });

        return $this->success([
            'items' => $items,
        ], 'OK', [
            'page' => $paginator->currentPage(),
            'per_page' => $paginator->perPage(),
            'total' => $paginator->total(),
            'last_page' => $paginator->lastPage(),
        ]);
    }

    /**
     * POST /api/v1/failed-jobs/{id}/retry
     * Retry a single failed job.
     */
    public function retry(Request $request, int $id)
    {
        $job = DB::table('failed_jobs')->where('id', $id)->first();

        if (! $job) {
            return $this->error('Failed job not found.', null, 404);
        }

        $payload = json_decode($job->payload, true);

        // Re-dispatch to the original queue
        Queue::connection($job->connection)
            ->queue($job->payload);

        // Delete the failed job record
        DB::table('failed_jobs')->where('id', $id)->delete();

        return $this->success(null, 'Job re-dispatched successfully.');
    }

    /**
     * POST /api/v1/failed-jobs/retry-all
     * Retry all failed jobs.
     */
    public function retryAll(Request $request)
    {
        $jobs = DB::table('failed_jobs')->get();
        $count = 0;

        foreach ($jobs as $job) {
            try {
                Queue::connection($job->connection)
                    ->queue($job->payload);
                DB::table('failed_jobs')->where('id', $job->id)->delete();
                $count++;
            } catch (\Throwable $e) {
                // Skip jobs that fail to re-dispatch
                continue;
            }
        }

        return $this->success(null, "{$count} of {$jobs->count()} jobs re-dispatched.");
    }

    /**
     * DELETE /api/v1/failed-jobs/{id}
     * Delete a single failed job.
     */
    public function destroy(int $id)
    {
        $deleted = DB::table('failed_jobs')->where('id', $id)->delete();

        if (! $deleted) {
            return $this->error('Failed job not found.', null, 404);
        }

        return $this->success(null, 'Failed job deleted.');
    }
}
