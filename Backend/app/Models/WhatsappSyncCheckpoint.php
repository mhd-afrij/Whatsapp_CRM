<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use App\Models\Concerns\ReadOnlyFromBackend;
use Illuminate\Database\Eloquent\Model;

/** Gateway-owned table (see docs/DATA_OWNERSHIP.md). Read-only from the backend. */
class WhatsappSyncCheckpoint extends Model
{
    use BelongsToWorkspace, ReadOnlyFromBackend;

    protected $fillable = ['workspace_id', 'checkpoint_type', 'cursor', 'last_synced_at'];

    protected function casts(): array
    {
        return ['last_synced_at' => 'datetime'];
    }
}
