<?php

namespace App\Console\Commands;

use App\Models\Notification;
use App\Models\Task;
use App\Services\NotificationService;
use Illuminate\Console\Command;

/**
 * Finds open tasks whose due_at has passed and creates an in-app/email
 * notification (type `task.overdue`) for the assignee - once per task, not
 * once per run. There is no dedicated "overdue_notified_at" column on
 * `tasks`, so idempotency is checked against the `notifications` table
 * itself (a `task.overdue` row already carrying this task's id means it was
 * already sent), the same pattern SendTaskReminders uses via
 * `task_reminders.sent_at`, just without a schema change for a Phase 12
 * add-on trigger.
 */
class NotifyOverdueTasks extends Command
{
    protected $signature = 'tasks:notify-overdue';

    protected $description = 'Notify assignees of open tasks whose due_at has passed.';

    public function handle(): int
    {
        $overdue = Task::query()
            ->whereNotIn('status', ['done', 'cancelled'])
            ->whereNotNull('due_at')
            ->where('due_at', '<', now())
            ->with('assignee')
            ->get();

        $count = 0;

        foreach ($overdue as $task) {
            if (! $task->assignee) {
                continue;
            }

            $alreadyNotified = Notification::query()
                ->where('user_id', $task->assignee_id)
                ->where('type', 'task.overdue')
                ->whereJsonContains('data->task_id', $task->id)
                ->exists();

            if ($alreadyNotified) {
                continue;
            }

            NotificationService::notify($task->assignee, 'task.overdue', [
                'task_id' => $task->id,
                'title' => $task->title,
                'due_at' => optional($task->due_at)->toIso8601String(),
            ]);

            $count++;
        }

        $this->info("Sent {$count} overdue task notification(s).");

        return self::SUCCESS;
    }
}
