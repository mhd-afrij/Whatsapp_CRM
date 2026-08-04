<?php

namespace App\Support;

use App\Models\AuditLog;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Http\Request;

class AuditLogger
{
    /**
     * @param  array  $after  The new/changed field values (or, for create-only/delete-only
     *                        actions with no structured diff, whatever flat payload the call
     *                        site wants recorded).
     * @param  array  $before Prior field values for the same keys as $after, captured via
     *                        e.g. $model->only(array_keys($data)) *before* the model is saved,
     *                        or $model->getOriginal() intersected with $model->getChanges()
     *                        *after* saving. Left empty for create actions (nothing existed
     *                        before) and delete/action-only events that don't diff fields.
     */
    public static function log(string $action, ?User $actor = null, ?object $subject = null, array $after = [], ?Request $request = null, array $before = []): AuditLog
    {
        $request ??= request();

        // The audit_logs.workspace_id column is NOT NULL. For events with no resolvable
        // workspace (e.g. a failed login for an email that matches no user at all), fall back
        // to the single deployment workspace — see docs/DATA_OWNERSHIP.md's
        // single-workspace-per-deployment model.
        $workspaceId = $actor?->workspace_id ?? $subject?->workspace_id ?? Workspace::query()->value('id');

        $changes = null;
        if ($before || $after) {
            $changes = [
                'before' => $before ?: null,
                'after' => $after ?: null,
            ];
        }

        return AuditLog::create([
            'workspace_id' => $workspaceId,
            'user_id' => $actor?->id,
            'action' => $action,
            'subject_type' => $subject ? $subject::class : null,
            'subject_id' => $subject?->id,
            'changes' => $changes,
            'ip_address' => $request?->ip(),
            'user_agent' => $request?->userAgent(),
        ]);
    }
}
