<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CrmNotification extends Model
{
    use BelongsToWorkspace;

    protected $table = 'crm_notifications';

    protected $fillable = [
        'workspace_id',
        'user_id',
        'type',
        'title',
        'body',
        'read_at',
        'notifiable_type',
        'notifiable_id',
    ];

    protected function casts(): array
    {
        return [
            'read_at' => 'datetime',
        ];
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
