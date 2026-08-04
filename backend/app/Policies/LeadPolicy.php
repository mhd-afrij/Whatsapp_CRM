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
        return $this->manage($user, $lead);
    }

    protected function manage(User $user, Lead $lead): bool
    {
        if (! $user->hasPermission('leads.manage')) {
            return false;
        }

        // "Own" scope for roles (e.g. Agent) that only manage what they own.
        return $lead->owner_user_id === $user->id || $user->hasAnyPermission(['users.manage', 'roles.manage']);
    }
}
