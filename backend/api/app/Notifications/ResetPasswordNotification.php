<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class ResetPasswordNotification extends Notification
{
    public function __construct(private readonly string $token) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $url = rtrim(config('services.frontend.url'), '/').'/reset-password?token='.$this->token;

        return (new MailMessage)
            ->subject('Reset your WhatsApp CRM password')
            ->line('You requested a password reset.')
            ->action('Reset Password', $url)
            ->line('This link expires in 1 hour. If you did not request this, no action is required.');
    }
}
