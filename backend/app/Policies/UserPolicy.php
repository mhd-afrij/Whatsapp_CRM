<?php

namespace App\Policies;

use App\Models\User;

class UserPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('users.view');
    }

    public function view(User $user, User $target): bool
    {
        return $user->hasPermission('users.view') || $user->id === $target->id;
    }

    public function update(User $user, User $target): bool
    {
        return $user->hasPermission('users.manage') || $user->id === $target->id;
    }

    public function suspend(User $user, User $target): bool
    {
        // The permission matrix (docs/07-permission-matrix.md) has no dedicated
        // "users.suspend" permission; suspend/reactivate are covered by "users.manage".
        return $user->hasPermission('users.manage') && $user->id !== $target->id;
    }

    public function reactivate(User $user, User $target): bool
    {
        return $user->hasPermission('users.manage');
    }

    public function delete(User $user, User $target): bool
    {
        return $user->hasPermission('users.manage') && $user->id !== $target->id;
    }
}
