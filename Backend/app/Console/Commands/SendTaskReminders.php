<?php

namespace App\Console\Commands;

use App\Models\TaskReminder;
use App\Services\NotificationService;
use Illuminate\Console\Command;

class SendTaskReminders extends Command
{
    protected $signature = 'tasks:send-reminders';

    protected $description = 'Find due, unsent task_reminders and create in-app notifications for the assignee.';

    public function handle(): int
    {
        $due = TaskReminder::query()
            ->whereNull('sent_at')
            ->where('remind_at', '<=', now())
            ->with('task.assignee')
            ->get();

        $count = 0;

        foreach ($due as $reminder) {
            $task = $reminder->task;
            if (! $task || ! $task->assignee) {
                $reminder->update(['sent_at' => now()]);

                continue;
            }

            NotificationService::notify($task->assignee, 'task.reminder', [
                'task_id' => $task->id,
                'title' => $task->title,
                'due_at' => optional($task->due_at)->toIso8601String(),
            ]);

            $reminder->update(['sent_at' => now()]);
            $count++;
        }

        $this->info("Sent {$count} task reminder notification(s).");

        return self::SUCCESS;
    }
}
