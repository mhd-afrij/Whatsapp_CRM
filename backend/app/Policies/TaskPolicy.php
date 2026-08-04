<?php

namespace App\Policies;

use App\Models\Task;
use App\Models\User;

class TaskPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('tasks.manage') || $user->hasPermission('tasks.view_team');
    }

    public function view(User $user, Task $task): bool
    {
        if ($user->hasPermission('tasks.view_team')) {
            return true;
        }

        return $user->hasPermission('tasks.manage')
            && ($task->assignee_id === $user->id || $task->created_by === $user->id);
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('tasks.manage');
    }

    public function update(User $user, Task $task): bool
    {
        // tasks.view_team only broadens *visibility*, not edit rights — editing stays scoped
        // to tasks.manage's "Own" semantics per docs/07-permission-matrix.md, except for
        // users who additionally hold users.manage/roles.manage (full admin override).
        return $user->hasPermission('tasks.manage')
            && ($task->assignee_id === $user->id || $task->created_by === $user->id || $user->hasAnyPermission(['users.manage', 'roles.manage']));
    }

    public function delete(User $user, Task $task): bool
    {
        return $this->update($user, $task);
    }
}
