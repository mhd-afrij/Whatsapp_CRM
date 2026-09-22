<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A queued/generated file export for the Reports module (see
 * ReportExportController + GenerateReportExportJob). One row per export request:
 * status (queued/processing/ready/failed), the Blob file path once generated,
 * and the filter snapshot the export was built from. Exports belong to a user
 * within a workspace, and the download route is user-scoped just like
 * Notification-based exports.
 */
class ReportExport extends Model
{
    use BelongsToWorkspace;

    public const STATUS_QUEUED = 'queued';

    public const STATUS_PROCESSING = 'processing';

    public const STATUS_READY = 'ready';

    public const STATUS_FAILED = 'failed';

    /** All supported types (ReportExportController whitelists these too). */
    public const TYPES = ['contacts', 'deals', 'tasks', 'daily_metrics', 'agent_summary', 'full_pdf'];

    protected $fillable = [
        'workspace_id', 'user_id', 'type', 'filters', 'status',
        'file_path', 'file_name', 'mime_type', 'row_count', 'error_message', 'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'filters' => 'array',
            'completed_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
