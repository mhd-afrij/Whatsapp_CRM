<?php

namespace App\Notifications;

use App\Models\Invitation;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class InvitationNotification extends Notification
{
    use Queueable;

    public function __construct(public readonly Invitation $invitation) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $frontendUrl = rtrim(config('app.frontend_url', 'http://localhost:3000'), '/');
        $token = $this->invitation->inviteUrlToken();
        $url = sprintf('%s/accept-invitation?token=%s', $frontendUrl, $token);
        $workspace = $this->invitation->workspace?->name ?? 'this workspace';
        $inviter = $this->invitation->inviter?->name ?? 'A workspace administrator';
        $role = $this->invitation->role?->name ?? 'a workspace role';

        return (new MailMessage)
            ->subject("You're invited to join {$workspace}")
            ->line("{$inviter} invited you to join {$workspace} as {$role}.")
            ->when((bool) $this->invitation->message, fn (MailMessage $mail) => $mail->line($this->invitation->message))
            ->action('Accept Invitation', $url)
            ->line('This invitation link will expire on '.$this->invitation->expires_at->toDayDateTimeString().'.');
    }
}
