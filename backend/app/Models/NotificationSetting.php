<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NotificationSetting extends Model
{
    protected $fillable = [
        'user_id', 'email_enabled', 'email_digest', 'digest_time', 'quiet_hours',
        'in_app_sound', 'browser_notifications', 'show_unread_badge', 'auto_mark_read',
    ];

    protected function casts(): array
    {
        return [
            'email_enabled' => 'boolean',
            'quiet_hours' => 'array',
            'in_app_sound' => 'boolean',
            'browser_notifications' => 'boolean',
            'show_unread_badge' => 'boolean',
            'auto_mark_read' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}