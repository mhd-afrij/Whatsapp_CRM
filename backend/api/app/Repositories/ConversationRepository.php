<?php

namespace App\Repositories;

use App\Models\Conversation;
use Illuminate\Database\Eloquent\Collection;

class ConversationRepository
{
    public function __construct(
        private readonly Conversation $model = new Conversation,
    ) {}

    public function getByWorkspace(int $workspaceId): Collection
    {
        return $this->model->newQuery()
            ->where('workspace_id', $workspaceId)
            ->with('assignee:id,name,email')
            ->orderByRaw('last_message_at IS NULL, last_message_at DESC')
            ->get();
    }

    public function findById(int $id, int $workspaceId): ?Conversation
    {
        return $this->model->newQuery()
            ->where('id', $id)
            ->where('workspace_id', $workspaceId)
            ->first();
    }

    public function findOrCreateByPhone(int $workspaceId, string $phone, array $defaults = []): Conversation
    {
        return $this->model->newQuery()->firstOrCreate(
            ['workspace_id' => $workspaceId, 'contact_phone' => $phone],
            $defaults
        );
    }

    public function getUnassigned(int $workspaceId, int $limit = 5): Collection
    {
        return $this->model->newQuery()
            ->where('workspace_id', $workspaceId)
            ->where('status', 'open')
            ->whereNull('assignee_id')
            ->orderByDesc('last_message_at')
            ->take($limit)
            ->get(['id', 'contact_name', 'contact_phone', 'last_message_at']);
    }
}
