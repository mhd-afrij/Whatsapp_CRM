<?php

namespace App\Policies;

use App\Models\MessageTemplate;
use App\Models\User;

class MessageTemplatePolicy
{
    /**
     * Any authenticated workspace user with the ability to reply to
     * conversations can list/use templates (to render the composer picker).
     * Management (create/update/delete) is gated by templates.manage.
     */
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('templates.use');
    }

    public function view(User $user, MessageTemplate $template): bool
    {
        return $user->hasPermission('templates.use');
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('templates.manage');
    }

    public function update(User $user, MessageTemplate $template): bool
    {
        return $user->hasPermission('templates.manage');
    }

    public function delete(User $user, MessageTemplate $template): bool
    {
        return $user->hasPermission('templates.manage');
    }
}
