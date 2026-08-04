<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Gateway-owned table, but rows are created by the backend calling
 * POST /internal/gateway/send-message (see docs/DATA_OWNERSHIP.md); the gateway
 * then owns updates to status/attempts/message_id. Not marked ReadOnlyFromBackend
 * because the backend's dispatch call is the documented creation path.
 */
class MessageDispatchQueue extends Model
{
    use BelongsToWorkspace;

    protected $table = 'message_dispatch_queue';

    protected $fillable = [
        'workspace_id', 'conversation_id', 'requested_by_user_id', 'payload',
        'bullmq_job_id', 'status', 'attempts', 'message_id',
    ];

    protected function casts(): array
    {
        return ['payload' => 'array'];
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function requestedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by_user_id');
    }

    public function message(): BelongsTo
    {
        return $this->belongsTo(Message::class);
    }
}