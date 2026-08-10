<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Notifications\Notifiable;
use Illuminate\Notifications\Notification;

class Invitation extends Model
{
    use BelongsToWorkspace, Notifiable;

    /**
     * Invitations are sent by email address, not via a login-capable notifiable route.
     */
    public function routeNotificationForMail(Notification $notification): string
    {
        return $this->email;
    }

    protected $fillable = [
        'workspace_id', 'email', 'role_id', 'invited_by', 'token', 'status', 'expires_at', 'accepted_at',
    ];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'accepted_at' => 'datetime',
        ];
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    public function inviter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_by');
    }
}
