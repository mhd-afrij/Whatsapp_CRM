<?php

namespace App\Notifications;

use App\Models\Invitation;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class InvitationNotification extends Notification
{
    use Queueable;

    public function __construct(public readonly Invitation $invitation)
    {
    }

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $frontendUrl = rtrim(config('app.frontend_url', 'http://localhost:3000'), '/');
        $url = sprintf('%s/accept-invitation?token=%s', $frontendUrl, $this->invitation->token);

        return (new MailMessage)
            ->subject('You have been invited to join a workspace')
            ->line('You have been invited to join a workspace on the WhatsApp CRM.')
            ->action('Accept Invitation', $url)
            ->line('This invitation link will expire on '.$this->invitation->expires_at->toDayDateTimeString().'.');
    }
}
