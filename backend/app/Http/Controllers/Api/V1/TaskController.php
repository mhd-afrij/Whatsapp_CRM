<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Task;
use App\Models\TaskComment;
use App\Models\User;
use App\Services\NotificationService;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class TaskController extends Controller
{
    /**
     * GET /api/v1/tasks
     *
     * Filters: mine=1 (assignee or creator is the current user), team=1 (requires
     * tasks.view_team — all workspace tasks), overdue=1, upcoming=1 (due within 7 days,
     * not yet done), status, priority, contact_id/lead_id/deal_id/conversation_id.
     */
    public function index(Request $request)
    {
        $this->authorize('viewAny', Task::class);

        $user = $request->user();
        $query = Task::query()->with(['assignee', 'creator', 'contact', 'lead', 'deal', 'conversation']);

        $canViewTeam = $user->isSuperAdmin() || $user->hasPermission('tasks.view_team');

        if ($request->boolean('team')) {
            abort_unless($canViewTeam, 403, 'You do not have permission to view team tasks.');
            // no extra scoping — all workspace tasks (BelongsToWorkspace global scope handles isolation)
        } else {
            // Default (and explicit ?mine=1) view is always scoped to the current user's own
            // tasks — "team" must be requested explicitly, even for users who hold
            // tasks.view_team, so the default list view is "my tasks" as specified.
            $query->where(function ($q) use ($user) {
                $q->where('assignee_id', $user->id)->orWhere('created_by', $user->id);
            });
        }

        if ($request->filled('status')) {
            $query->where('status', $request->string('status')->toString());
        }

        if ($request->filled('priority')) {
            $query->where('priority', $request->string('priority')->toString());
        }

        foreach (['contact_id', 'lead_id', 'deal_id', 'conversation_id', 'assignee_id'] as $field) {
            if ($request->filled($field)) {
                $query->where($field, $request->integer($field));
            }
        }

        if ($request->boolean('overdue')) {
            $query->whereNotNull('due_at')->where('due_at', '<', now())->whereNotIn('status', ['done', 'cancelled']);
        }

        if ($request->boolean('upcoming')) {
            $query->whereNotNull('due_at')
                ->whereBetween('due_at', [now(), now()->addDays(7)])
                ->whereNotIn('status', ['done', 'cancelled']);
        }

        if ($request->boolean('completed')) {
            $query->where('status', 'done');
        }

        $perPage = min(max((int) $request->integer('per_page', 15), 1), 100);
        $paginator = $query->orderBy('due_at')->orderByDesc('created_at')->paginate($perPage);

        return $this->success($paginator->items(), 'OK', [
            'page' => $paginator->currentPage(),
            'per_page' => $paginator->perPage(),
            'total' => $paginator->total(),
            'last_page' => $paginator->lastPage(),
        ]);
    }

    public function show(Request $request, Task $task)
    {
        $this->authorize('view', $task);

        $task->load(['assignee', 'creator', 'contact', 'lead', 'deal', 'conversation', 'reminders', 'comments.author']);

        return $this->success($task, 'OK');
    }

    public function store(Request $request)
    {
        $this->authorize('create', Task::class);

        $validator = Validator::make($request->all(), [
            'title' => ['required', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
            'assignee_id' => ['sometimes', 'nullable', 'integer', Rule::exists('users', 'id')],
            'contact_id' => ['sometimes', 'nullable', 'integer', Rule::exists('contacts', 'id')],
            'lead_id' => ['sometimes', 'nullable', 'integer', Rule::exists('leads', 'id')],
            'deal_id' => ['sometimes', 'nullable', 'integer', Rule::exists('deals', 'id')],
            'conversation_id' => ['sometimes', 'nullable', 'integer', Rule::exists('conversations', 'id')],
            'due_at' => ['sometimes', 'nullable', 'date'],
            'priority' => ['sometimes', Rule::in(['low', 'medium', 'high', 'urgent'])],
            'reminder_at' => ['sometimes', 'nullable', 'date'],
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $data = $validator->validated();
        $reminderAt = $data['reminder_at'] ?? null;
        unset($data['reminder_at']);

        $task = Task::create(array_merge($data, [
            'workspace_id' => $request->user()->workspace_id,
            'created_by' => $request->user()->id,
            'assignee_id' => $data['assignee_id'] ?? $request->user()->id,
            'status' => 'open',
        ]));

        if ($reminderAt) {
            $task->reminders()->create(['remind_at' => $reminderAt, 'channel' => 'in_app']);
        }

        AuditLogger::log('task.created', $request->user(), $task, $data, $request);

        if ($task->assignee_id && $task->assignee_id !== $request->user()->id) {
            $assignee = User::find($task->assignee_id);
            if ($assignee) {
                NotificationService::notify($assignee, 'task.assigned', ['task_id' => $task->id, 'title' => $task->title]);
            }
        }

        return $this->success($task->fresh(['assignee', 'creator', 'contact', 'lead', 'deal', 'conversation']), 'Task created', null, 201);
    }

    public function update(Request $request, Task $task)
    {
        $this->authorize('update', $task);

        $validator = Validator::make($request->all(), [
            'title' => ['sometimes', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
            'assignee_id' => ['sometimes', 'nullable', 'integer', Rule::exists('users', 'id')],
            'contact_id' => ['sometimes', 'nullable', 'integer', Rule::exists('contacts', 'id')],
            'lead_id' => ['sometimes', 'nullable', 'integer', Rule::exists('leads', 'id')],
            'deal_id' => ['sometimes', 'nullable', 'integer', Rule::exists('deals', 'id')],
            'conversation_id' => ['sometimes', 'nullable', 'integer', Rule::exists('conversations', 'id')],
            'due_at' => ['sometimes', 'nullable', 'date'],
            'priority' => ['sometimes', Rule::in(['low', 'medium', 'high', 'urgent'])],
            'status' => ['sometimes', Rule::in(['open', 'in_progress', 'done', 'cancelled'])],
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $data = $validator->validated();
        $before = $task->only(array_keys($data));
        $previousAssignee = $task->assignee_id;

        $task->update($data);

        AuditLogger::log('task.updated', $request->user(), $task, $data, $request, $before);

        if (array_key_exists('assignee_id', $data) && $data['assignee_id'] && $data['assignee_id'] !== $previousAssignee) {
            $assignee = User::find($data['assignee_id']);
            if ($assignee) {
                NotificationService::notify($assignee, 'task.assigned', ['task_id' => $task->id, 'title' => $task->title]);
            }
            AuditLogger::log('task.assigned', $request->user(), $task, ['assignee_id' => $data['assignee_id']], $request, ['assignee_id' => $previousAssignee]);
        }

        return $this->success($task->fresh(['assignee', 'creator', 'contact', 'lead', 'deal', 'conversation']), 'Task updated');
    }

    public function destroy(Request $request, Task $task)
    {
        $this->authorize('delete', $task);

        $task->delete();

        AuditLogger::log('task.deleted', $request->user(), $task, [], $request);

        return $this->success(null, 'Task deleted');
    }

    public function complete(Request $request, Task $task)
    {
        $this->authorize('update', $task);

        $task->update(['status' => 'done', 'completed_at' => now()]);

        AuditLogger::log('task.completed', $request->user(), $task, [], $request);

        return $this->success($task->fresh(['assignee', 'creator']), 'Task marked complete');
    }

    public function reopen(Request $request, Task $task)
    {
        $this->authorize('update', $task);

        $task->update(['status' => 'open', 'completed_at' => null]);

        AuditLogger::log('task.reopened', $request->user(), $task, [], $request);

        return $this->success($task->fresh(['assignee', 'creator']), 'Task reopened');
    }

    /**
     * POST /api/v1/tasks/{id}/comments
     */
    public function storeComment(Request $request, Task $task)
    {
        $this->authorize('view', $task);

        $validator = Validator::make($request->all(), [
            'body' => ['required', 'string'],
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $comment = TaskComment::create([
            'task_id' => $task->id,
            'author_id' => $request->user()->id,
            'body' => $request->string('body')->toString(),
        ]);

        // Parse @username mentions and notify matched workspace users (task_comments has no
        // dedicated mention table in the schema — unlike internal_notes/note_mentions — so
        // mentions here are notified directly rather than persisted as rows).
        $this->notifyMentions($task, $comment, $request);

        AuditLogger::log('task.comment_created', $request->user(), $task, ['comment_id' => $comment->id], $request);

        return $this->success($comment->fresh('author'), 'Comment added', null, 201);
    }

    public function comments(Request $request, Task $task)
    {
        $this->authorize('view', $task);

        return $this->success($task->comments()->with('author')->orderBy('created_at')->get(), 'OK');
    }

    private function notifyMentions(Task $task, TaskComment $comment, Request $request): void
    {
        if (! preg_match_all('/@([a-zA-Z0-9_.\-]+)/', $comment->body, $matches)) {
            return;
        }

        $handles = array_unique($matches[1]);
        if (empty($handles)) {
            return;
        }

        $mentioned = User::query()
            ->where('workspace_id', $request->user()->workspace_id)
            ->where(function ($q) use ($handles) {
                foreach ($handles as $handle) {
                    $q->orWhere('name', 'like', str_replace(' ', '', $handle))
                        ->orWhere('email', 'like', $handle.'@%');
                }
            })
            ->get();

        foreach ($mentioned as $user) {
            NotificationService::notify($user, 'task.comment_mention', [
                'task_id' => $task->id,
                'comment_id' => $comment->id,
            ]);
        }
    }
}
