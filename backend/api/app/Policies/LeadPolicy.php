<?php

namespace App\Policies;

use App\Models\Lead;
use App\Models\User;

class LeadPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('leads.view');
    }

    public function view(User $user, Lead $lead): bool
    {
        return $user->workspace_id === $lead->workspace_id
            && $user->hasPermission('leads.view');
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('leads.create');
    }

    public function update(User $user, Lead $lead): bool
    {
        return $user->workspace_id === $lead->workspace_id
            && $user->hasPermission('leads.update');
    }

    public function delete(User $user, Lead $lead): bool
    {
        return $user->workspace_id === $lead->workspace_id
            && $user->hasPermission('leads.delete');
    }
}
