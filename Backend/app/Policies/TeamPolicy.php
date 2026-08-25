<?php

namespace App\Policies;

use App\Models\Team;
use App\Models\User;

class TeamPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('teams.view');
    }

    public function view(User $user, Team $team): bool
    {
        return $user->hasPermission('teams.view');
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('teams.manage');
    }

    public function update(User $user, Team $team): bool
    {
        return $user->hasPermission('teams.manage');
    }

    public function delete(User $user, Team $team): bool
    {
        return $user->hasPermission('teams.manage');
    }

    public function manageMembers(User $user, Team $team): bool
    {
        return $user->hasPermission('teams.manage');
    }
}
