<?php

namespace App\Policies;

use App\Models\CalendarEvent;
use App\Models\User;

class CalendarEventPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('tasks.manage') || $user->hasPermission('tasks.view_team');
    }

    public function view(User $user, CalendarEvent $event): bool
    {
        return $this->viewAny($user);
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('tasks.manage');
    }

    public function update(User $user, CalendarEvent $event): bool
    {
        return $user->hasPermission('tasks.manage');
    }

    public function delete(User $user, CalendarEvent $event): bool
    {
        return $this->update($user, $event);
    }
}
