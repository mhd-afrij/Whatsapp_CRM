<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Central place every mutation goes through to satisfy CLAUDE.md rule 1.9:
 * "All important data mutations must produce an audit log." audit_logs is
 * append-only — nothing here ever updates or deletes an existing row.
 */
class AuditLogger
{
    public function __construct(private readonly Request $request) {}

    public function log(
        int $workspaceId,
        ?User $actor,
        string $action,
        string $entityType,
        ?int $entityId = null,
        ?array $beforeState = null,
        ?array $afterState = null,
    ): AuditLog {
        return AuditLog::create([
            'workspace_id' => $workspaceId,
            'user_id' => $actor?->id,
            'action' => $action,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'before_state' => $beforeState,
            'after_state' => $afterState,
            'ip_address' => $this->request->ip(),
            'user_agent' => $this->request->userAgent(),
            'correlation_id' => $this->request->attributes->get('correlation_id') ?? (string) Str::uuid(),
        ]);
    }
}
