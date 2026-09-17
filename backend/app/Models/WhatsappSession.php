<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use App\Models\Concerns\ReadOnlyFromBackend;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Gateway-owned table (see docs/DATA_OWNERSHIP.md). The backend may only read this
 * model; write methods are disabled by the ReadOnlyFromBackend trait.
 */
class WhatsappSession extends Model
{
    use BelongsToWorkspace, ReadOnlyFromBackend;

    protected $fillable = [
        'workspace_id', 'whatsapp_account_id', 'status', 'phone_number', 'device_id', 'last_connected_at',
        'last_disconnected_at', 'disconnect_reason', 'qr_code', 'qr_expires_at',
    ];

    protected function casts(): array
    {
        return [
            'whatsapp_account_id' => 'integer',
            'last_connected_at' => 'datetime',
            'last_disconnected_at' => 'datetime',
            'qr_expires_at' => 'datetime',
        ];
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(WhatsappAccount::class, 'whatsapp_account_id');
    }
}
