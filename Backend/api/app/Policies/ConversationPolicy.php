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
        return $user->workspace_id === $conversation->workspace_id
            && $user->hasPermission('conversations.view');
    }

    public function update(User $user, Conversation $conversation): bool
    {
        return $user->workspace_id === $conversation->workspace_id
            && $user->hasPermission('conversations.update');
    }

    public function assign(User $user, Conversation $conversation): bool
    {
        return $user->workspace_id === $conversation->workspace_id
            && $user->hasPermission('conversations.assign');
    }

    public function close(User $user, Conversation $conversation): bool
    {
        return $user->workspace_id === $conversation->workspace_id
            && $user->hasPermission('conversations.close');
    }
}
