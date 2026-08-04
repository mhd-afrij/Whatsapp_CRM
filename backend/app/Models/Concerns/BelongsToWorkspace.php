<?php

namespace App\Models\Concerns;

use App\Models\Scopes\WorkspaceScope;
use App\Models\Workspace;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Applied to every tenant-scoped model. Adds the WorkspaceScope global scope
 * (query-time isolation) and auto-fills workspace_id from the current
 * authentication context on create when it is not explicitly set.
 */
trait BelongsToWorkspace
{
    public static function bootBelongsToWorkspace(): void
    {
        static::addGlobalScope(new WorkspaceScope);

        static::creating(function ($model) {
            if (empty($model->workspace_id)) {
                $workspaceId = WorkspaceScope::resolveWorkspaceId();

                if ($workspaceId !== null) {
                    $model->workspace_id = $workspaceId;
                }
            }
        });
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }
}
