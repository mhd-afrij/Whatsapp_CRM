<?php

namespace App\Policies;

use App\Models\Campaign;
use App\Models\User;

class CampaignPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('campaigns.view');
    }

    public function view(User $user, Campaign $campaign): bool
    {
        return $user->hasPermission('campaigns.view')
            && $user->workspace_id === $campaign->workspace_id;
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('campaigns.create');
    }

    public function update(User $user, Campaign $campaign): bool
    {
        return $user->hasPermission('campaigns.update')
            && $user->workspace_id === $campaign->workspace_id;
    }

    public function delete(User $user, Campaign $campaign): bool
    {
        return $user->hasPermission('campaigns.delete')
            && $user->workspace_id === $campaign->workspace_id;
    }

    public function send(User $user, Campaign $campaign): bool
    {
        return $user->hasPermission('campaigns.send')
            && $user->workspace_id === $campaign->workspace_id;
    }
}
