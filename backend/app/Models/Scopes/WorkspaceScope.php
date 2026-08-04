<?php

namespace App\Models\Scopes;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

/**
 * Global scope enforcing tenant (workspace) isolation on every query for models
 * that use the BelongsToWorkspace trait. Automatically constrains queries to the
 * currently authenticated user's workspace_id, so one workspace can never read
 * (or, via the trait's creating hook, write) another workspace's rows.
 */
class WorkspaceScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        $workspaceId = static::resolveWorkspaceId();

        if ($workspaceId !== null) {
            $builder->where($model->qualifyColumn('workspace_id'), $workspaceId);
        }
    }

    /**
     * Reentrancy guard: resolving the authenticated user (auth()->user())
     * queries the users table, which is itself workspace-scoped. Without this
     * guard that query re-enters resolveWorkspaceId() and recurses forever.
     */
    private static bool $resolving = false;

    public static function resolveWorkspaceId(): ?int
    {
        if (app()->bound('currentWorkspaceId')) {
            return app('currentWorkspaceId');
        }

        if (static::$resolving) {
            return null;
        }

        static::$resolving = true;

        try {
            $user = auth()->user();

            return $user?->workspace_id;
        } finally {
            static::$resolving = false;
        }
    }
}
