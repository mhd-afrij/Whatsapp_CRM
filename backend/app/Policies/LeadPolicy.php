<?php

namespace App\Policies;

use App\Models\Lead;
use App\Models\User;

class LeadPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('leads.manage');
    }

    public function view(User $user, Lead $lead): bool
    {
        return $this->manage($user, $lead);
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('leads.manage');
    }

    public function update(User $user, Lead $lead): bool
    {
        return $this->manage($user, $lead);
    }

    public function delete(User $user, Lead $lead): bool
    {
        if (! $user->hasPermission('leads.manage')) {
            return false;
        }

        // Admins and managers can delete; agents can only delete their own.
        if ($user->hasAnyPermission(['users.manage', 'roles.manage'])) {
            return true;
        }

        return $lead->owner_user_id === $user->id;
    }

    /**
     * Agents see only their own leads unless they have leads.view_all.
     */
    public function viewAll(User $user): bool
    {
        return $user->hasPermission('leads.view_all')
            || $user->hasAnyPermission(['users.manage', 'roles.manage']);
    }

    public function assign(User $user, Lead $lead): bool
    {
        if (! $user->hasPermission('leads.manage')) {
            return false;
        }

        return $user->hasAnyPermission(['users.manage', 'roles.manage'])
            || $lead->owner_user_id === $user->id;
    }

    public function convert(User $user, Lead $lead): bool
    {
        return $this->manage($user, $lead);
    }

    public function markLost(User $user, Lead $lead): bool
    {
        return $this->manage($user, $lead);
    }

    protected function manage(User $user, Lead $lead): bool
    {
        if (! $user->hasPermission('leads.manage')) {
            return false;
        }

        // Admins/managers see all; agents see own.
        return $lead->owner_user_id === $user->id
            || $user->hasAnyPermission(['users.manage', 'roles.manage']);
    }
}
