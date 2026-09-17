<?php

namespace App\Console\Commands;

use App\Models\CalendarEvent;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Console\Command;

class SendCalendarEventReminders extends Command
{
    protected $signature = 'calendar-events:send-reminders';

    protected $description = 'Notify every active workspace user about due calendar follow-ups.';

    public function handle(): int
    {
        $events = CalendarEvent::query()
            ->whereNull('completed_at')
            ->whereNull('reminder_sent_at')
            ->whereNotNull('reminder_at')
            ->where('reminder_at', '<=', now())
            ->get();

        $count = 0;
        foreach ($events as $event) {
            $users = User::query()
                ->where('workspace_id', $event->workspace_id)
                ->where('is_active', true)
                ->get();

            foreach ($users as $user) {
                NotificationService::notify($user, 'calendar_event.reminder', [
                    'calendar_event_id' => $event->id,
                    'lead_id' => $event->lead_id,
                    'title' => $event->title,
                    'starts_at' => $event->starts_at?->toIso8601String(),
                ]);
                $count++;
            }

            $event->update(['reminder_sent_at' => now()]);
        }

        $this->info("Sent {$count} calendar event reminder notification(s).");
        return self::SUCCESS;
    }
}