<?php

namespace App\Models;

use App\Models\Concerns\ReadOnlyFromBackend;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Gateway-owned table (see docs/DATA_OWNERSHIP.md). Read-only from the backend. */
class WhatsappSessionCredential extends Model
{
    use ReadOnlyFromBackend;

    protected $fillable = ['whatsapp_session_id', 'key_name', 'value'];

    public function session(): BelongsTo
    {
        return $this->belongsTo(WhatsappSession::class, 'whatsapp_session_id');
    }
}