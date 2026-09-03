<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WhatsAppAccount extends Model
{
    use BelongsToWorkspace;

    protected $table = 'whatsapp_accounts';

    protected $fillable = [
        'workspace_id',
        'phone_number',
        'device_name',
        'session_state',
        'linked_at',
        'last_seen_at',
    ];

    protected function casts(): array
    {
        return [
            'linked_at' => 'datetime',
            'last_seen_at' => 'datetime',
        ];
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }

    public function conversations(): HasMany
    {
        return $this->hasMany(Conversation::class);
    }
}
