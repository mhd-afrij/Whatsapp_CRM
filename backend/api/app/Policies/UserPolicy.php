<?php

namespace App\Policies;

use App\Models\User;

class UserPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('users.view');
    }

    public function view(User $target, User $user): bool
    {
        return $user->workspace_id === $target->workspace_id
            && $user->hasPermission('users.view');
    }

    public function update(User $target, User $user): bool
    {
        return $user->workspace_id === $target->workspace_id
            && $user->hasPermission('users.update');
    }
}
