<?php

namespace App\Repositories;

use App\Models\Task;
use Illuminate\Database\Eloquent\Collection;

class TaskRepository
{
    public function __construct(
        private readonly Task $model = new Task,
    ) {}

    public function getByWorkspace(int $workspaceId): Collection
    {
        return $this->model->newQuery()
            ->where('workspace_id', $workspaceId)
            ->with('assignee:id,name,email')
            ->orderByRaw("FIELD(status, 'open', 'completed', 'cancelled')")
            ->orderByDesc('priority')
            ->get();
    }

    public function findById(int $id, int $workspaceId): ?Task
    {
        return $this->model->newQuery()
            ->where('id', $id)
            ->where('workspace_id', $workspaceId)
            ->first();
    }

    public function create(array $data): Task
    {
        return $this->model->newQuery()->create($data);
    }

    public function update(Task $task, array $data): Task
    {
        $task->fill($data)->save();

        return $task;
    }

    public function delete(Task $task): bool
    {
        return $task->forceDelete();
    }
}
