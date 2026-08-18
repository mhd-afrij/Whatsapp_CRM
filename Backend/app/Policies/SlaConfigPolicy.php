<?php

namespace App\Policies;

use App\Models\SlaConfig;
use App\Models\User;

class SlaConfigPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('workspace.settings.manage');
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('workspace.settings.manage');
    }

    public function update(User $user, SlaConfig $slaConfig): bool
    {
        return $user->hasPermission('workspace.settings.manage');
    }

    public function delete(User $user, SlaConfig $slaConfig): bool
    {
        return $user->hasPermission('workspace.settings.manage');
    }
}
