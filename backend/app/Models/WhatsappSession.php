<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use App\Models\Concerns\ReadOnlyFromBackend;
use Illuminate\Database\Eloquent\Model;

/**
 * Gateway-owned table (see docs/DATA_OWNERSHIP.md). The backend may only read this
 * model; write methods are disabled by the ReadOnlyFromBackend trait.
 */
class WhatsappSession extends Model
{
    use BelongsToWorkspace, ReadOnlyFromBackend;

    protected $fillable = [
        'workspace_id', 'status', 'phone_number', 'device_id', 'last_connected_at',
        'last_disconnected_at', 'disconnect_reason', 'qr_code', 'qr_expires_at',
    ];

    protected function casts(): array
    {
        return [
            'last_connected_at' => 'datetime',
            'last_disconnected_at' => 'datetime',
            'qr_expires_at' => 'datetime',
        ];
    }
}
