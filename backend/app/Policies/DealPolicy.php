<?php

namespace App\Policies;

use App\Models\Deal;
use App\Models\User;

class DealPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('deals.manage');
    }

    public function view(User $user, Deal $deal): bool
    {
        return $this->manage($user, $deal);
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('deals.manage');
    }

    public function update(User $user, Deal $deal): bool
    {
        return $this->manage($user, $deal);
    }

    public function delete(User $user, Deal $deal): bool
    {
        return $this->manage($user, $deal);
    }

    protected function manage(User $user, Deal $deal): bool
    {
        if (! $user->hasPermission('deals.manage')) {
            return false;
        }

        return $deal->owner_user_id === $user->id || $user->hasAnyPermission(['users.manage', 'roles.manage']);
    }
}
