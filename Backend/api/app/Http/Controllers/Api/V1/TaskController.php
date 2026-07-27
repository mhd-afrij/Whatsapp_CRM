<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CalendarEvent;
use App\Models\Task;
use App\Repositories\TaskRepository;
use App\Traits\Auditable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TaskController extends Controller
{
    use Auditable;

    public function __construct(
        private readonly TaskRepository $tasks,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $data = $this->tasks->getByWorkspace($request->user()->workspace_id);

        return response()->json(['data' => $data]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'due_at' => ['nullable', 'date'],
            'priority' => ['required', 'in:low,normal,high,urgent'],
            'status' => ['required', 'in:open,completed,cancelled'],
            'assignee_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        $task = $this->tasks->create(
            $data + ['workspace_id' => $request->user()->workspace_id]
        );

        $this->auditLog(
            $request->user()->workspace_id,
            $request->user(),
            'task.create',
            'Task',
            $task->id,
            null,
            $task->toArray()
        );

        return response()->json(['data' => $task], 201);
    }

    public function update(Request $request, Task $task): JsonResponse
    {
        abort_unless($task->workspace_id === $request->user()->workspace_id, 404);

        $data = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'due_at' => ['nullable', 'date'],
            'priority' => ['sometimes', 'required', 'in:low,normal,high,urgent'],
            'status' => ['sometimes', 'required', 'in:open,completed,cancelled'],
            'assignee_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        $before = $task->toArray();
        $task = $this->tasks->update($task, $data);

        $this->auditLog(
            $request->user()->workspace_id,
            $request->user(),
            'task.update',
            'Task',
            $task->id,
            $before,
            $task->toArray()
        );

        return response()->json(['data' => $task]);
    }

    public function archive(Request $request, Task $task): JsonResponse
    {
        abort_unless($task->workspace_id === $request->user()->workspace_id, 404);

        $this->tasks->delete($task);

        $this->auditLog(
            $request->user()->workspace_id,
            $request->user(),
            'task.archive',
            'Task',
            $task->id
        );

        return response()->json(['data' => null, 'message' => 'Task archived.']);
    }

    public function destroy(Request $request, Task $task): JsonResponse
    {
        abort_unless($task->workspace_id === $request->user()->workspace_id, 404);

        $this->tasks->delete($task);

        $this->auditLog(
            $request->user()->workspace_id,
            $request->user(),
            'task.delete',
            'Task',
            $task->id
        );

        return response()->json(['data' => null, 'message' => 'Task deleted.']);
    }

    // Calendar Events

    public function calendar(Request $request): JsonResponse
    {
        return response()->json([
            'data' => CalendarEvent::where('workspace_id', $request->user()->workspace_id)
                ->orderBy('starts_at')
                ->get(),
        ]);
    }

    public function storeCalendarEvent(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'starts_at' => ['required', 'date'],
            'ends_at' => ['nullable', 'date'],
            'location' => ['nullable', 'string', 'max:255'],
            'kind' => ['required', 'string', 'max:255'],
        ]);

        $event = CalendarEvent::create(
            $data + ['workspace_id' => $request->user()->workspace_id]
        );

        return response()->json(['data' => $event], 201);
    }

    public function updateCalendarEvent(Request $request, CalendarEvent $event): JsonResponse
    {
        abort_unless($event->workspace_id === $request->user()->workspace_id, 404);

        $data = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'starts_at' => ['sometimes', 'required', 'date'],
            'ends_at' => ['nullable', 'date'],
            'location' => ['nullable', 'string', 'max:255'],
            'kind' => ['sometimes', 'required', 'string', 'max:255'],
        ]);

        $event->fill($data)->save();

        return response()->json(['data' => $event]);
    }

    public function archiveCalendarEvent(Request $request, CalendarEvent $event): JsonResponse
    {
        abort_unless($event->workspace_id === $request->user()->workspace_id, 404);
        $event->delete();

        return response()->json(['data' => null, 'message' => 'Calendar event archived.']);
    }

    public function destroyCalendarEvent(Request $request, CalendarEvent $event): JsonResponse
    {
        abort_unless($event->workspace_id === $request->user()->workspace_id, 404);
        $event->forceDelete();

        return response()->json(['data' => null, 'message' => 'Calendar event deleted.']);
    }
}
