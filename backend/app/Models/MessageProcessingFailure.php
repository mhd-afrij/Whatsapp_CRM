<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use App\Models\Concerns\ReadOnlyFromBackend;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Gateway-owned table (see docs/DATA_OWNERSHIP.md). Read-only from the backend. */
class MessageProcessingFailure extends Model
{
    use BelongsToWorkspace, ReadOnlyFromBackend;

    public $timestamps = false;

    protected $fillable = [
        'workspace_id', 'message_dispatch_queue_id', 'conversation_id', 'stage', 'error_message', 'error_context',
    ];

    protected function casts(): array
    {
        return ['error_context' => 'array'];
    }

    public function dispatchQueueEntry(): BelongsTo
    {
        return $this->belongsTo(MessageDispatchQueue::class, 'message_dispatch_queue_id');
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }
}
