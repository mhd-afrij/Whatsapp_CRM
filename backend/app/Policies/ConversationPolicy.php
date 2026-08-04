<?php

namespace App\Policies;

use App\Models\Conversation;
use App\Models\User;

class ConversationPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('conversations.view');
    }

    public function view(User $user, Conversation $conversation): bool
    {
        if (! $user->hasPermission('conversations.view')) {
            return false;
        }

        if ($user->hasPermission('conversations.view_all')) {
            return true;
        }

        return $conversation->assigned_user_id === $user->id
            || ($conversation->assigned_team_id && $user->teams()->where('teams.id', $conversation->assigned_team_id)->exists());
    }

    public function reply(User $user, Conversation $conversation): bool
    {
        return $user->hasPermission('conversations.reply') && $this->view($user, $conversation);
    }

    public function assign(User $user, Conversation $conversation): bool
    {
        return $user->hasPermission('conversations.assign') && $this->view($user, $conversation);
    }

    public function close(User $user, Conversation $conversation): bool
    {
        if ($user->hasPermission('conversations.close') && $user->hasPermission('conversations.view_all')) {
            return true;
        }

        return $user->hasPermission('conversations.close') && $conversation->assigned_user_id === $user->id;
    }

    public function reopen(User $user, Conversation $conversation): bool
    {
        return $user->hasPermission('conversations.reopen') && $this->view($user, $conversation);
    }

    public function changePriority(User $user, Conversation $conversation): bool
    {
        return $user->hasPermission('conversations.change_priority') && $this->view($user, $conversation);
    }

    public function delete(User $user): bool
    {
        return $user->hasPermission('conversations.delete');
    }
}
