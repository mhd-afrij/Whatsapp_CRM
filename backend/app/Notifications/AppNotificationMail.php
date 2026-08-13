<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Generic email channel for every `notifications` table trigger type (Phase 12). One
 * Mailable-style class handles all types rather than one class per type because the
 * subject/body only need the type + its data payload to render a reasonable message,
 * and `notification_preferences.email_enabled` is checked per-type before this is ever
 * dispatched (see NotificationService::notify()) - so by the time this class exists, the
 * user has already opted in to email for this exact type.
 *
 * Implements ShouldQueue so `Notification::send()` pushes a queued job rather than
 * sending synchronously; only queued-job creation was verified in this environment (no
 * SMTP credentials configured), never live delivery - see PROJECT_STATUS.md Phase 12.
 */
class AppNotificationMail extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public readonly string $type, public readonly array $data = []) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject($this->subjectFor($this->type))
            ->line($this->lineFor($this->type, $this->data));
    }

    private function subjectFor(string $type): string
    {
        return match ($type) {
            'conversation.assigned' => 'A conversation was assigned to you',
            'conversation.new_message' => 'New message on your conversation',
            'task.assigned' => 'A task was assigned to you',
            'task.reminder' => 'Task reminder',
            'task.overdue' => 'Task overdue',
            'task.comment_mention', 'note.mention' => 'You were mentioned',
            'whatsapp.connection.failed' => 'WhatsApp connection issue',
            'whatsapp.connection.reauth_required' => 'WhatsApp re-authentication required',
            'report.export_ready' => 'Your report export is ready',
            default => 'New notification',
        };
    }

    private function lineFor(string $type, array $data): string
    {
        return match ($type) {
            'conversation.assigned' => 'A conversation has been assigned to you. Open the inbox to view it.',
            'conversation.new_message' => 'A new message arrived on a conversation assigned to you.',
            'task.assigned' => 'You have been assigned a task: '.($data['title'] ?? 'Untitled task'),
            'task.reminder' => 'Reminder for task: '.($data['title'] ?? 'Untitled task'),
            'task.overdue' => 'Task is overdue: '.($data['title'] ?? 'Untitled task'),
            'task.comment_mention' => 'You were mentioned in a task comment.',
            'note.mention' => 'You were mentioned in an internal note.',
            'whatsapp.connection.failed' => 'The workspace WhatsApp connection failed. Please check the connection settings.',
            'whatsapp.connection.reauth_required' => 'The workspace WhatsApp connection needs to be re-authenticated (scan the QR code again).',
            'report.export_ready' => 'Your report export ('.($data['type'] ?? 'data').') is ready to download.',
            default => 'You have a new notification.',
        };
    }
}
