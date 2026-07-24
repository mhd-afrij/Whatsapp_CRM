<?php

namespace App\Models\Scopes;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;
use Illuminate\Support\Facades\Auth;

/**
 * Enforces CLAUDE.md rule 1.8: every workspace-scoped query must include
 * workspace_id. Applied automatically to every model using BelongsToWorkspace.
 *
 * Only scopes when an authenticated user is resolvable on the request guard.
 * Console/queue contexts (no authenticated user) are intentionally left
 * unscoped here — jobs that touch workspace data must filter explicitly by
 * the workspace_id they were dispatched with.
 */
class WorkspaceScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        if (Auth::check()) {
            $builder->where($model->qualifyColumn('workspace_id'), Auth::user()->workspace_id);
        }
    }
}
