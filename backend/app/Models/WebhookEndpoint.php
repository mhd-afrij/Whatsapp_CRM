<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Outgoing webhook endpoint. The signing secret is encrypted at rest via the
 * `encrypted` cast and is never included in serialized responses.
 */
class WebhookEndpoint extends Model
{
    use BelongsToWorkspace;

    public const DEFAULT_TIMEOUT_SECONDS = 10;
    public const MAX_TIMEOUT_SECONDS = 60;

    protected $fillable = [
        'workspace_id',
        'name',
        'url',
        'description',
        'secret',
        'is_active',
        'timeout_seconds',
        'max_retries',
        'last_delivery_at',
        'created_by',
    ];

    protected $hidden = ['secret'];

    protected function casts(): array
    {
        return [
            'secret' => 'encrypted',
            'is_active' => 'boolean',
            'timeout_seconds' => 'integer',
            'max_retries' => 'integer',
            'last_delivery_at' => 'datetime',
            'created_by' => 'integer',
        ];
    }

    public function subscriptions(): HasMany
    {
        return $this->hasMany(WebhookSubscription::class, 'webhook_id');
    }

    public function deliveries(): HasMany
    {
        return $this->hasMany(WebhookDelivery::class, 'webhook_id');
    }
}