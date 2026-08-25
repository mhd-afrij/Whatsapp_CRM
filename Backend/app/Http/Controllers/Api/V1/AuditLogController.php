<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Traits\ApiResponse;
use Illuminate\Http\Request;

/**
 * Read-only browsing of the audit_logs table every prior phase's controllers
 * already write to via App\Support\AuditLogger (see AuditLogger::log - action/
 * actor/subject_type/subject_id/ip_address/user_agent/created_at are all
 * populated on every call site checked). Gated `audit_logs.view` per
 * docs/07-permission-matrix.md.
 *
 * `changes` is stored as a structured {before, after} pair (see
 * App\Support\AuditLogger::log's $before/$after params). Update-type actions
 * capture the model's prior field values (via getOriginal()/only() before the
 * save) under `before` and the new values under `after`; create-only actions
 * have `before === null` (nothing existed yet) and delete-only actions
 * typically have `after === null` since there's nothing left to snapshot.
 * This controller exposes both directly from the stored shape rather than
 * inventing a `before` that was never captured.
 */
class AuditLogController extends Controller
{
    use ApiResponse;

    public function index(Request $request)
    {
        $data = $request->validate([
            'date_from' => ['sometimes', 'date'],
            'date_to' => ['sometimes', 'date'],
            'user_id' => ['sometimes', 'integer'],
            'action' => ['sometimes', 'string'],
            'subject_type' => ['sometimes', 'string'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ]);

        $query = AuditLog::query()
            ->where('workspace_id', $request->user()->workspace_id)
            ->with('user:id,name,email')
            ->orderByDesc('created_at');

        if (! empty($data['date_from'])) {
            $query->where('created_at', '>=', $data['date_from']);
        }
        if (! empty($data['date_to'])) {
            $query->where('created_at', '<=', $data['date_to']);
        }
        if (! empty($data['user_id'])) {
            $query->where('user_id', $data['user_id']);
        }
        if (! empty($data['action'])) {
            $query->where('action', 'like', '%'.$data['action'].'%');
        }
        if (! empty($data['subject_type'])) {
            $query->where('subject_type', 'like', '%'.$data['subject_type'].'%');
        }

        $perPage = $data['per_page'] ?? 25;
        $logs = $query->paginate($perPage);

        return $this->success(
            $logs->getCollection()->map(fn (AuditLog $log) => $this->listPayload($log))->all(),
            'OK',
            [
                'current_page' => $logs->currentPage(),
                'per_page' => $logs->perPage(),
                'total' => $logs->total(),
                'last_page' => $logs->lastPage(),
            ]
        );
    }

    public function show(Request $request, AuditLog $auditLog)
    {
        if ($auditLog->workspace_id !== $request->user()->workspace_id) {
            return $this->error('Audit log entry not found.', null, 404);
        }

        $auditLog->loadMissing('user:id,name,email');

        return $this->success($this->detailPayload($auditLog), 'OK');
    }

    protected function listPayload(AuditLog $log): array
    {
        return [
            'id' => $log->id,
            'action' => $log->action,
            'subject_type' => $log->subject_type,
            'subject_id' => $log->subject_id,
            'actor' => $log->user ? ['id' => $log->user->id, 'name' => $log->user->name, 'email' => $log->user->email] : null,
            'ip_address' => $log->ip_address,
            'created_at' => $log->created_at,
        ];
    }

    protected function detailPayload(AuditLog $log): array
    {
        return array_merge($this->listPayload($log), [
            'user_agent' => $log->user_agent,
            'before' => $log->changes['before'] ?? null,
            'after' => $log->changes['after'] ?? null,
            'changes' => $log->changes,
        ]);
    }
}
