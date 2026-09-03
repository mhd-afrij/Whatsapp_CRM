<?php

namespace App\Events;

use App\Models\Notification;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class NotificationCreated
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public readonly Notification $notification,
    ) {}
}
