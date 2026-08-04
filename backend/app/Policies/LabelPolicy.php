<?php

namespace App\Policies;

use App\Models\Label;
use App\Models\User;

class LabelPolicy
{
    public function viewAny(User $user): bool
    {
        // Any authenticated workspace user can see the label list (needed to filter/tag
        // records); only labels.manage gates create/update/delete.
        return true;
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('labels.manage');
    }

    public function update(User $user, Label $label): bool
    {
        return $user->hasPermission('labels.manage');
    }

    public function delete(User $user, Label $label): bool
    {
        return $user->hasPermission('labels.manage');
    }
}
