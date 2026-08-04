<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Jobs\GenerateReportExportJob;
use App\Models\Notification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;

/**
 * Gated on analytics.export. Dispatches a queued CSV export job
 * (App\Jobs\GenerateReportExportJob) rather than generating synchronously, per the spec's
 * "background generation ... download notification" requirement - see the job's docblock
 * for why this still runs inline under QUEUE_CONNECTION=sync in this environment.
 */
class ReportExportController extends Controller
{
    private const TYPES = ['contacts', 'leads', 'deals', 'tasks'];

    /** POST /api/v1/reports/export {type, from, to} */
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'type' => 'required|string|in:'.implode(',', self::TYPES),
            'from' => 'nullable|date',
            'to' => 'nullable|date',
        ]);

        if ($validator->fails()) {
            return $this->error('Validation failed.', $validator->errors());
        }

        $user = $request->user();

        GenerateReportExportJob::dispatch(
            $user->workspace_id,
            $user->id,
            $request->string('type')->toString(),
            $request->input('from'),
            $request->input('to'),
        );

        return $this->success(['status' => 'queued'], 'Export queued - you will be notified when it is ready.', null, 202);
    }

    /**
     * GET /api/v1/reports/export/{notification}/download
     *
     * The export job writes the file path into the `report.export_ready` notification's
     * `data.file`, so the notification id doubles as the download handle - it is already
     * user- and workspace-scoped (NotificationController's isolation model applies
     * identically here, since Notification's route-model binding + BelongsToWorkspace scope
     * 404 a foreign-workspace id before this method runs).
     */
    public function download(Request $request, Notification $notification)
    {
        if ($notification->user_id !== $request->user()->id || $notification->type !== 'report.export_ready') {
            abort(404);
        }

        $path = $notification->data['file'] ?? null;

        if (! $path || ! Storage::disk('local')->exists($path)) {
            return $this->error('Export file not found - it may have expired.', null, 404);
        }

        return Storage::disk('local')->download($path);
    }
}
