<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use App\Models\Concerns\ReadOnlyFromBackend;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/** Gateway-owned table (see docs/DATA_OWNERSHIP.md). Read-only from the backend. */
class Message extends Model
{
    use BelongsToWorkspace, ReadOnlyFromBackend;

    protected $fillable = [
        'workspace_id', 'conversation_id', 'whatsapp_message_id', 'direction', 'sender_type',
        'sender_user_id', 'message_type', 'body', 'status', 'replied_to_message_id',
        'is_deleted_for_everyone', 'sent_at',
    ];

    protected function casts(): array
    {
        return [
            'is_deleted_for_everyone' => 'boolean',
            'sent_at' => 'datetime',
        ];
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_user_id');
    }

    public function repliedTo(): BelongsTo
    {
        return $this->belongsTo(Message::class, 'replied_to_message_id');
    }

    public function media(): HasOne
    {
        return $this->hasOne(MessageMedia::class);
    }

    public function statusEvents(): HasMany
    {
        return $this->hasMany(MessageStatusEvent::class);
    }

    public function reactions(): HasMany
    {
        return $this->hasMany(MessageReaction::class);
    }
}