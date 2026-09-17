<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WebhookDelivery extends Model
{
    use BelongsToWorkspace;

    public const STATUS_PENDING = 'pending';
    public const STATUS_RETRYING = 'retrying';
    public const STATUS_SUCCESS = 'success';
    public const STATUS_FAILED = 'failed';

    public $timestamps = false;

    protected $fillable = [
        'workspace_id',
        'webhook_id',
        'event_id',
        'event_name',
        'payload_json',
        'status',
        'attempt_count',
        'max_retries',
        'last_http_status',
        'last_error',
        'created_at',
        'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'webhook_id' => 'integer',
            'attempt_count' => 'integer',
            'max_retries' => 'integer',
            'last_http_status' => 'integer',
            'created_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function webhook(): BelongsTo
    {
        return $this->belongsTo(WebhookEndpoint::class, 'webhook_id');
    }

    public function attempts(): HasMany
    {
        return $this->hasMany(WebhookDeliveryAttempt::class, 'delivery_id')->orderBy('attempt_number');
    }
}