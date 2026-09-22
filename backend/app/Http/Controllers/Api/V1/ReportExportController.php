<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Jobs\GenerateReportExportJob;
use App\Models\Notification;
use App\Models\ReportExport;
use App\Services\AzureBlobService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/**
 * Export endpoints for the Reports module.
 *
 * Legacy (gated on analytics.export, virtual files - status lives in the notification):
 *   POST /api/v1/reports/export {type: contacts|deals|tasks, from, to}
 *   GET  /api/v1/reports/export/{notification}/download
 *
 * v2 (gated on reports.export, status records tracked in report_exports):
 *   GET    /api/v1/reports/exports                  - list the requesting user's exports
 *   POST   /api/v1/reports/exports {type, from, to} - queue an export (returns the record)
 *   GET    /api/v1/reports/exports/{reportExport}/download
 *   POST   /api/v1/reports/exports/{reportExport}/retry
 *
 * All generation is queued (GenerateReportExportJob) - never synchronous in the
 * controller - and both flows notify through the notification bell when ready.
 */
class ReportExportController extends Controller
{
    public function __construct(protected AzureBlobService $azureBlob) {}

    private const TYPES = ['contacts', 'deals', 'tasks'];

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

        if (! $path || ! $this->azureBlob->exists($path)) {
            return $this->error('Export file not found - it may have expired.', null, 404);
        }

        return response($this->azureBlob->download($path), 200, [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => 'attachment; filename="'.basename($path).'"',
        ]);
    }

    /** GET /api/v1/reports/exports - the requesting user's own exports (newest first). */
    public function index(Request $request)
    {
        return $this->success(
            ReportExport::query()
                ->where('user_id', $request->user()->id)
                ->orderByDesc('id')
                ->limit(20)
                ->get()
        );
    }

    /** POST /api/v1/reports/exports {type, from, to} */
    public function storeExport(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'type' => 'required|string|in:'.implode(',', ReportExport::TYPES),
            'from' => 'nullable|date',
            'to' => 'nullable|date|after_or_equal:from',
        ]);

        if ($validator->fails()) {
            return $this->error('Validation failed.', $validator->errors());
        }

        $user = $request->user();
        $validated = $validator->validated();

        $export = ReportExport::create([
            'workspace_id' => $user->workspace_id,
            'user_id' => $user->id,
            'type' => $validated['type'],
            'filters' => [
                'range' => 'custom',
                'from' => $validated['from'] ?? null,
                'to' => $validated['to'] ?? null,
            ],
            'status' => ReportExport::STATUS_QUEUED,
        ]);

        GenerateReportExportJob::dispatch(
            $user->workspace_id,
            $user->id,
            $validated['type'],
            $validated['from'] ?? null,
            $validated['to'] ?? null,
            $export->id,
        );

        return $this->success($export, 'Export queued - you will be notified when it is ready.', null, 202);
    }

    /** GET /api/v1/reports/exports/{reportExport}/download */
    public function downloadExport(Request $request, ReportExport $reportExport)
    {
        // Route-model binding + BelongsToWorkspace already 404 foreign-workspace ids;
        // the file itself is further user-scoped, like Notification-based exports.
        if ($reportExport->user_id !== $request->user()->id || $reportExport->status !== ReportExport::STATUS_READY || ! $reportExport->file_path) {
            abort(404);
        }

        if (! $this->azureBlob->exists($reportExport->file_path)) {
            return $this->error('Export file not found - it may have expired.', null, 404);
        }

        return response($this->azureBlob->download($reportExport->file_path), 200, [
            'Content-Type' => $reportExport->mime_type ?? 'application/octet-stream',
            'Content-Disposition' => 'attachment; filename="'.($reportExport->file_name ?? basename($reportExport->file_path)).'"',
        ]);
    }

    /** POST /api/v1/reports/exports/{reportExport}/retry */
    public function retry(Request $request, ReportExport $reportExport)
    {
        if ($reportExport->user_id !== $request->user()->id) {
            abort(404);
        }

        $reportExport->status = ReportExport::STATUS_QUEUED;
        $reportExport->error_message = null;
        $reportExport->save();

        GenerateReportExportJob::dispatch(
            $reportExport->workspace_id,
            $reportExport->user_id,
            $reportExport->type,
            $reportExport->filters['from'] ?? null,
            $reportExport->filters['to'] ?? null,
            $reportExport->id,
        );

        return $this->success($reportExport->fresh(), 'Export re-queued.');
    }
}
