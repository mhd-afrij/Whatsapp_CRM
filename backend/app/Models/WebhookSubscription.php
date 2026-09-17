<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WebhookSubscription extends Model
{
    protected $fillable = [
        'webhook_id',
        'event_name',
    ];

    public function webhook(): BelongsTo
    {
        return $this->belongsTo(WebhookEndpoint::class, 'webhook_id');
    }
}