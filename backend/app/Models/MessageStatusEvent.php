<?php

namespace App\Models;

use App\Models\Concerns\ReadOnlyFromBackend;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Gateway-owned table (see docs/DATA_OWNERSHIP.md). Read-only from the backend. */
class MessageStatusEvent extends Model
{
    use ReadOnlyFromBackend;

    public $timestamps = false;

    protected $fillable = ['message_id', 'status', 'occurred_at', 'raw_payload'];

    protected function casts(): array
    {
        return [
            'occurred_at' => 'datetime',
            'raw_payload' => 'array',
        ];
    }

    public function message(): BelongsTo
    {
        return $this->belongsTo(Message::class);
    }
}