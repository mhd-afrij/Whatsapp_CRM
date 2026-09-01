<?php

namespace App\Repositories;

use App\Models\Lead;
use Illuminate\Database\Eloquent\Collection;

class LeadRepository
{
    public function __construct(
        private readonly Lead $model = new Lead,
    ) {}

    public function getByWorkspace(int $workspaceId): Collection
    {
        return $this->model->newQuery()
            ->where('workspace_id', $workspaceId)
            ->orderByDesc('created_at')
            ->get();
    }

    public function findById(int $id, int $workspaceId): ?Lead
    {
        return $this->model->newQuery()
            ->where('id', $id)
            ->where('workspace_id', $workspaceId)
            ->first();
    }

    public function create(array $data): Lead
    {
        return $this->model->newQuery()->create($data);
    }

    public function update(Lead $lead, array $data): Lead
    {
        $lead->fill($data)->save();

        return $lead;
    }

    public function delete(Lead $lead): bool
    {
        return $lead->forceDelete();
    }
}
