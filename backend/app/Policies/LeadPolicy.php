<?php

namespace App\Policies;

use App\Models\Lead;
use App\Models\User;

class LeadPolicy
{
    public function viewAny(User $user): bool { return $user->hasPermission('leads.manage'); }
    public function create(User $user): bool { return $user->hasPermission('leads.manage'); }
    public function view(User $user, Lead $lead): bool { return $this->manage($user, $lead); }
    public function update(User $user, Lead $lead): bool { return $this->manage($user, $lead); }
    public function delete(User $user, Lead $lead): bool { return $this->manage($user, $lead); }
    private function manage(User $user, Lead $lead): bool
    {
        return $user->hasPermission('leads.manage') && ($lead->owner_user_id === null || $lead->owner_user_id === $user->id || $user->hasAnyPermission(['users.manage', 'roles.manage']));
    }
}
