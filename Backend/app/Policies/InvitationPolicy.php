<?php

namespace App\Policies;

use App\Models\Invitation;
use App\Models\User;

class InvitationPolicy
{
    public function resendInvitation(User $user, Invitation $invitation): bool
    {
        return $user->hasPermission('invitations.manage');
    }
}
