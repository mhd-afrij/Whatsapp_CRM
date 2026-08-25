<?php

namespace App\Models;

use App\Models\Concerns\ReadOnlyFromBackend;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Gateway-owned table (see docs/DATA_OWNERSHIP.md). Read-only from the backend. */
class MessageMedia extends Model
{
    use ReadOnlyFromBackend;

    protected $fillable = [
        'message_id', 'mime_type', 'file_size_bytes', 'storage_path', 'thumbnail_path',
        'duration_seconds', 'width', 'height', 'checksum_sha256',
    ];

    public function message(): BelongsTo
    {
        return $this->belongsTo(Message::class);
    }
}