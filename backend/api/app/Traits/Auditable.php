<?php

namespace App\Traits;

use App\Services\AuditLogger;

trait Auditable
{
    protected function auditLog(
        int $workspaceId,
        ?\App\Models\User $actor,
        string $action,
        string $entityType,
        ?int $entityId = null,
        ?array $beforeState = null,
        ?array $afterState = null,
    ): void {
        /** @var AuditLogger $auditLogger */
        $auditLogger = app(AuditLogger::class);
        $auditLogger->log($workspaceId, $actor, $action, $entityType, $entityId, $beforeState, $afterState);
    }
}
