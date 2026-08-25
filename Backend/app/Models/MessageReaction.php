<?php

namespace App\Models;

use App\Models\Concerns\ReadOnlyFromBackend;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Gateway-owned table (see docs/DATA_OWNERSHIP.md). Read-only from the backend. */
class MessageReaction extends Model
{
    use ReadOnlyFromBackend;

    protected $fillable = ['message_id', 'whatsapp_contact_id', 'user_id', 'emoji', 'reacted_at'];

    protected function casts(): array
    {
        return ['reacted_at' => 'datetime'];
    }

    public function message(): BelongsTo
    {
        return $this->belongsTo(Message::class);
    }

    public function whatsappContact(): BelongsTo
    {
        return $this->belongsTo(WhatsappContact::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
