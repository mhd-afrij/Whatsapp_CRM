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
     * @param  array  $before  Prior field values for the same keys as $after, captured via
     *                         e.g. $model->only(array_keys($data)) *before* the model is saved,
     *                         or $model->getOriginal() intersected with $model->getChanges()
     *                         *after* saving. Left empty for create actions (nothing existed
     *                         before) and delete/action-only events that don't diff fields.
     */
    public static function log(string $action, ?User $actor = null, ?object $subject = null, array $after = [], ?Request $request = null, array $before = []): AuditLog
    {
        $request ??= request();

        $workspaceId = static::resolveWorkspaceId($actor, $subject);

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

    /**
     * audit_logs.workspace_id is NOT NULL, but some events have no tenant of
     * their own: a failed login for an email matching no user has neither an
     * actor nor a subject, and no actor means auth()->user() is null, so the
     * BelongsToWorkspace creating hook cannot fill the column either.
     *
     * ponytail: unattributable events land in the lowest-id workspace (the
     * default one on a seeded install), so tenant #1's admins can see other
     * tenants' failed logins. Rejected-email attribution needs a separate
     * unauthenticated security log, not a guess here.
     */
    protected static function resolveWorkspaceId(?User $actor, ?object $subject): int
    {
        $workspaceId = $actor?->workspace_id ?? $subject?->workspace_id;

        if ($workspaceId !== null) {
            return $workspaceId;
        }

        $existing = Workspace::query()->min('id');

        if ($existing !== null) {
            return $existing;
        }

        // Never seeded (fresh install): provision the default workspace rather
        // than let the NOT NULL violation turn a failed login's 422 into a 500.
        // createOrFirst, not firstOrCreate, so the duplicate-slug loser of a
        // concurrent first write re-reads the winner instead of throwing.
        return Workspace::query()->createOrFirst(
            ['slug' => 'default'],
            ['name' => 'Default Workspace', 'timezone' => 'UTC', 'is_active' => true],
        )->id;
    }
}
