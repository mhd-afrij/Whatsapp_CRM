<?php

namespace App\Models\Concerns;

use RuntimeException;

/**
 * Applied to Eloquent models representing gateway-owned tables (see
 * docs/DATA_OWNERSHIP.md). The backend is allowed to read these tables but must
 * never write to them directly — mutations go through the whatsapp-gateway's
 * internal HTTP API instead. This trait enforces that boundary at the model
 * layer as defense-in-depth alongside code review and DB grants.
 */
trait ReadOnlyFromBackend
{
    public static function bootReadOnlyFromBackend(): void
    {
        static::saving(function () {
            throw new RuntimeException(static::class.' is a gateway-owned model (see docs/DATA_OWNERSHIP.md) and is read-only from the backend.');
        });

        static::deleting(function () {
            throw new RuntimeException(static::class.' is a gateway-owned model (see docs/DATA_OWNERSHIP.md) and is read-only from the backend.');
        });
    }
}
